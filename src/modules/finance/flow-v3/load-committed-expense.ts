import "server-only";
import { prisma } from "@/lib/prisma";
import { computePayrollCashForTenant, computeStaffPayrollCashForTenant } from "@/modules/finance/cashflow/payroll-cash.service";
import { computeFromFichas } from "@/modules/finance/cashflow/generators/quincena-sync";
import { computeF29Period } from "@/modules/finance/billing/f29.service";
import {
  deriveCommittedExpense,
  type ExpenseMilestoneInput,
  type ReceivedDteExpenseInput,
} from "./derive-committed-expense";
import { loadExpenseParametrics } from "./load-committed-expense-params";
import { loadMilestoneDateOverrides } from "./milestone-date-override.service";
import { loadIvaPostponements } from "./iva-postponement.service";
import {
  F29_LOOKBACK_MONTHS,
  lookbackFromYmd,
  splitF29Milestone,
} from "./iva-postponement";
import { bulkAccountToRow } from "./rowAccount.service";
import type { CommittedByRow, FlowRowRef } from "./types";

function ymdOf(y: number, monthZeroIdx: number, day: number): string {
  const last = new Date(Date.UTC(y, monthZeroIdx + 1, 0)).getUTCDate();
  const d = day === -1 ? last : Math.min(Math.max(day, 1), last);
  return new Date(Date.UTC(y, monthZeroIdx, d)).toISOString().slice(0, 10);
}

function monthsBetween(fromYmd: string, toYmd: string): Array<{ y: number; m: number }> {
  const [fy, fm] = fromYmd.split("-").map(Number);
  const [ty, tm] = toYmd.split("-").map(Number);
  const out: Array<{ y: number; m: number }> = [];
  let y = fy;
  let m = fm - 1;
  while (y < ty || (y === ty && m <= tm - 1)) {
    out.push({ y, m });
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }
  return out;
}

/**
 * Hitos payroll + F29 + DTEs recibidos por pagar → comprometido de egresos.
 * Solo lecturas. Reutiliza los cómputos de los generators del módulo viejo
 * (exportados) y el F29 canónico; NO usa FinanceCashflowItem/Occurrence.
 *
 * v5: `projectReceivedDtesAsExpense=false` omite DTEs recibidos del
 * comprometido (siguen alimentando crédito IVA). Los hitos payroll/F29
 * vencidos se mantienen; proyección paramétrica (TE/retiro/finiquitos/IVA
 * futuro) se agrega en loaders hermanos.
 */
export async function loadCommittedExpense(
  tenantId: string,
  rows: FlowRowRef[],
  weeks: string[],
  todayYmd: string,
): Promise<CommittedByRow> {
  const fromYmd = weeks[0];
  const toYmd = weeks[weeks.length - 1];
  if (!fromYmd || !toYmd) return new Map();

  const [config, receivedRaw, exclusions, pendingTes, payrollCash, staffCash, postponements] = await Promise.all([
    prisma.financeCashflowConfig.findUnique({
      where: { tenantId },
      select: {
        payrollPayDay: true, previRedPayDay: true, quincenaPayDay: true,
        quincenaMode: true, quincenaPctLiquido: true, ivaPayDay: true,
        collectionLagDays: true,
        projectReceivedDtesAsExpense: true,
      },
    }),
    prisma.financeDte.findMany({
      where: {
        tenantId,
        direction: "RECEIVED",
        dteType: { in: [33, 34, 46, 56] },
        paymentStatus: { in: ["UNPAID", "PARTIAL", "OVERDUE"] },
        voidedByCreditNoteId: null,
        OR: [
          { receptionStatus: null },
          { receptionStatus: { notIn: ["CLAIMED", "PARTIAL_CLAIM"] } },
        ],
      },
      select: {
        id: true, folio: true, date: true, dueDate: true,
        totalAmount: true, amountPaid: true, issuerName: true, supplierId: true,
        supplier: { select: { paymentTermDays: true } },
        lines: { select: { accountId: true } },
      },
    }),
    prisma.financeCashflowDteFlowExclusion.findMany({
      where: { tenantId },
      select: { dteId: true },
    }),
    // F5: turnos extra APROBADOS y aún no pagados = plata ya comprometida con
    // los guardias. Los futuros/estimados quedan como Plan del usuario.
    prisma.opsTurnoExtra.findMany({
      where: { tenantId, status: "approved", paidAt: null },
      select: { amountClp: true },
    }),
    // Fuente única: cotizaciones explícitas (sin residual ni provisiones).
    computePayrollCashForTenant(tenantId),
    computeStaffPayrollCashForTenant(tenantId),
    loadIvaPostponements(tenantId),
  ]);

  const liquidoTotal = payrollCash.total.liquido;
  const previRedTotal = payrollCash.total.previred;
  const impuestoUnicoTotal = payrollCash.total.impuestoUnico + staffCash.impuestoUnico;
  const previredMetaNote =
    previRedTotal > 0
      ? `trab $${payrollCash.total.cotizacionesTrabajador.toLocaleString("es-CL")} + patronal $${payrollCash.total.aportesEmpleador.toLocaleString("es-CL")} · provisiones excluidas $${payrollCash.total.provisiones.toLocaleString("es-CL")}`
      : undefined;
  const staffPreviredNote =
    staffCash.previred > 0
      ? `trab $${staffCash.cotizacionesTrabajador.toLocaleString("es-CL")} + patronal $${staffCash.aportesEmpleador.toLocaleString("es-CL")}`
      : undefined;

  const quincenaMode = config?.quincenaMode ?? "FICHA";
  const quincenaPct = Number(config?.quincenaPctLiquido ?? 0.1);
  const quincenaTotal =
    quincenaMode === "PCT_LIQUIDO"
      ? Math.round(liquidoTotal * quincenaPct)
      : ((await computeFromFichas(tenantId))?.amount ?? 0);
  const staffQuincenaTotal =
    quincenaMode === "PCT_LIQUIDO"
      ? Math.round(staffCash.liquido * quincenaPct)
      : 0;

  const payDay = config?.payrollPayDay ?? 30;
  const previredDay = config?.previRedPayDay ?? 10;
  const quincenaDay = config?.quincenaPayDay ?? 15;
  const ivaDay = config?.ivaPayDay ?? 12;

  const milestones: ExpenseMilestoneInput[] = [];
  for (const { y, m } of monthsBetween(fromYmd, toYmd)) {
    if (liquidoTotal > 0)
      milestones.push({
        key: "liquido",
        label: "Sueldos guardias",
        dateYmd: ymdOf(y, m, payDay),
        amountClp: liquidoTotal,
        laborClass: "OPERATIVO",
      });
    if (staffCash.liquido > 0)
      milestones.push({
        key: "liquido",
        label: "Sueldos equipo interno",
        dateYmd: ymdOf(y, m, payDay),
        amountClp: staffCash.liquido,
        laborClass: "ADMINISTRATIVO",
      });
    if (quincenaTotal > 0)
      milestones.push({
        key: "quincena",
        label: "Quincena guardias",
        dateYmd: ymdOf(y, m, quincenaDay),
        amountClp: quincenaTotal,
        laborClass: "OPERATIVO",
      });
    if (staffQuincenaTotal > 0)
      milestones.push({
        key: "quincena",
        label: "Quincena equipo interno",
        dateYmd: ymdOf(y, m, quincenaDay),
        amountClp: staffQuincenaTotal,
        laborClass: "ADMINISTRATIVO",
      });
    if (previRedTotal > 0)
      milestones.push({
        key: "previred",
        label: "Previred guardias",
        dateYmd: ymdOf(y, m, previredDay),
        amountClp: previRedTotal,
        metaNote: previredMetaNote,
        laborClass: "OPERATIVO",
      });
    if (staffCash.previred > 0)
      milestones.push({
        key: "previred",
        label: "Previred equipo interno",
        dateYmd: ymdOf(y, m, previredDay),
        amountClp: staffCash.previred,
        metaNote: staffPreviredNote,
        laborClass: "ADMINISTRATIVO",
      });
    // Impuesto único 2ª categoría: se entera con el F29 del mes siguiente.
    if (impuestoUnicoTotal > 0) {
      const payYmd = ymdOf(m === 11 ? y + 1 : y, (m + 1) % 12, ivaDay);
      if (payYmd >= fromYmd && payYmd <= toYmd) {
        milestones.push({
          key: "impuesto_unico",
          label: "Impuesto único 2ª categoría (retenciones)",
          dateYmd: payYmd,
          amountClp: impuestoUnicoTotal,
        });
      }
    }
  }

  // ── Turnos extra aprobados por pagar → semana actual (pagables ya) ──
  const teTotal = pendingTes.reduce((s, t) => s + Number(t.amountClp ?? 0), 0);
  if (teTotal > 0) {
    milestones.push({
      key: "turnos_extra",
      label: `Turnos extra por pagar (${pendingTes.length} aprobados)`,
      dateYmd: todayYmd,
      amountClp: Math.round(teTotal),
    });
  }

  // ── F29: solo períodos VENCIDOS (DTEs reales); se paga el mes siguiente ──
  // Lookback: un hito postergado cae en P+3 y debe verse aunque el mes de
  // pago original quede fuera de la ventana.
  const today = new Date(`${todayYmd}T00:00:00.000Z`);
  for (const { y, m } of monthsBetween(lookbackFromYmd(fromYmd, F29_LOOKBACK_MONTHS), toYmd)) {
    const periodEnd = new Date(Date.UTC(y, m + 1, 1));
    if (periodEnd.getTime() > today.getTime()) continue;
    const payYmd = ymdOf(m === 11 ? y + 1 : y, (m + 1) % 12, ivaDay);
    const periodo = `${y}-${String(m + 1).padStart(2, "0")}`;
    const postponement = postponements.get(periodo) ?? null;
    try {
      const f29 = await computeF29Period(tenantId, periodo);
      if (f29.f29.totalAPagar <= 0 && !postponement) continue;
      milestones.push(
        ...splitF29Milestone({
          taxPeriod: periodo,
          payYmd,
          totalAPagarClp: f29.f29.totalAPagar,
          ivaDeterminadoClp: f29.f29.ivaDeterminado,
          postponement,
        }),
      );
    } catch {
      // Período sin datos: omitir, jamás inventar montos.
    }
  }

  // ── v5: proyección paramétrica (retiro, TE, finiquitos, F29 futuro) ──
  const parametrics = await loadExpenseParametrics(
    tenantId,
    rows,
    weeks,
    todayYmd,
    fromYmd,
    toYmd,
    {
      liquidoTotal,
      previRedTotal,
      payDay,
      previredDay: previredDay,
      ivaDay,
      pendingTeTotal: teTotal,
      postponements,
    },
  );
  for (const patch of parametrics.payrollPatches) {
    const idx = milestones.findIndex(
      (m) =>
        m.key === patch.key &&
        m.dateYmd === patch.dateYmd &&
        (m.laborClass ?? "OPERATIVO") === "OPERATIVO",
    );
    if (idx >= 0) {
      const prev = milestones[idx];
      // Concatenar metaNote: el patch de descuento TE no debe pisar el
      // desglose de cotizaciones del hito Previred.
      const metaNote = [prev.metaNote, patch.metaNote].filter(Boolean).join(" · ") || undefined;
      milestones[idx] = {
        ...prev,
        amountClp: patch.amountClp,
        label: patch.label,
        metaNote,
      };
    }
  }
  milestones.push(...parametrics.milestones);

  // ── DTEs recibidos por pagar ──
  // Switch tenant (opt-in, default false): solo proyecta si está explícitamente
  // encendido. Sin config o false ⇒ cartola-first (crédito IVA F29 intacto).
  const projectReceived = config?.projectReceivedDtesAsExpense === true;
  let receivedDtes: ReceivedDteExpenseInput[] = [];
  let accountToRowId = new Map<string, string>();
  if (projectReceived) {
    const excluded = new Set(exclusions.map((e) => e.dteId));
    const allAccountIds = [
      ...new Set(
        receivedRaw.flatMap((d) => d.lines.map((l) => l.accountId).filter((x): x is string => !!x)),
      ),
    ];
    accountToRowId = await bulkAccountToRow(tenantId, allAccountIds);

    receivedDtes = receivedRaw
      .filter((d) => !excluded.has(d.id))
      .map((d) => {
        let accountPlanId: string | null = null;
        for (const l of d.lines) {
          if (l.accountId && accountToRowId.has(l.accountId)) {
            accountPlanId = l.accountId;
            break;
          }
        }
        if (!accountPlanId) {
          for (const l of d.lines) {
            if (l.accountId) {
              accountPlanId = l.accountId;
              break;
            }
          }
        }
        return {
          id: d.id,
          folio: d.folio,
          dateYmd: d.date.toISOString().slice(0, 10),
          dueDateYmd: d.dueDate ? d.dueDate.toISOString().slice(0, 10) : null,
          paymentTermDays: d.supplier?.paymentTermDays ?? config?.collectionLagDays ?? 30,
          pendingClp: Number(d.totalAmount) - Number(d.amountPaid),
          supplierId: d.supplierId,
          accountPlanId,
          issuerName: d.issuerName ?? "",
        };
      });
  }

  const milestoneOverrides = await loadMilestoneDateOverrides(tenantId);

  return deriveCommittedExpense({
    rows,
    weeks,
    todayYmd,
    milestones,
    receivedDtes,
    accountToRowId,
    teWeeklyProjections: parametrics.teWeeklyProjections,
    teRowId: parametrics.teRowId,
    tePlanBlockedWeeks: parametrics.tePlanBlockedWeeks,
    pctSalesProjections: parametrics.pctSalesProjections,
    milestoneOverrides,
  });
}
