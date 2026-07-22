import "server-only";
import { prisma } from "@/lib/prisma";
import { computeMonthlyPayrollForInstallation } from "@/modules/finance/cashflow/generators/payroll-sync";
import { computeFromFichas } from "@/modules/finance/cashflow/generators/quincena-sync";
import { computeF29Period } from "@/modules/finance/billing/f29.service";
import { bulkResolveCategoriesFromAccounts } from "@/modules/finance/cashflow/categoryAccount.service";
import {
  deriveCommittedExpense,
  type ExpenseMilestoneInput,
  type ReceivedDteExpenseInput,
} from "./derive-committed-expense";
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
 * Diferencias documentadas vs módulo viejo: no descuenta turnos extra del
 * líquido (TE no se deriva en v3 — es Plan del usuario) y el F29 comprometido
 * cubre SOLO períodos vencidos con DTEs reales (futuros = Plan).
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

  const [config, installations, categories, receivedRaw, exclusions, pendingTes] = await Promise.all([
    prisma.financeCashflowConfig.findUnique({
      where: { tenantId },
      select: {
        payrollPayDay: true, previRedPayDay: true, quincenaPayDay: true,
        quincenaMode: true, quincenaPctLiquido: true, ivaPayDay: true,
        collectionLagDays: true,
      },
    }),
    prisma.crmInstallation.findMany({ where: { tenantId }, select: { id: true } }),
    prisma.financeCashflowCategory.findMany({
      where: { tenantId },
      select: { id: true, code: true },
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
  ]);

  // ── Hitos payroll (dotación planificada, mismos cómputos del módulo viejo) ──
  let liquidoTotal = 0;
  let previRedTotal = 0;
  for (const inst of installations) {
    const r = await computeMonthlyPayrollForInstallation(tenantId, inst.id);
    if (r) {
      liquidoTotal += r.liquido;
      previRedTotal += r.previRed;
    }
  }
  const quincenaMode = config?.quincenaMode ?? "FICHA";
  const quincenaPct = Number(config?.quincenaPctLiquido ?? 0.1);
  const quincenaTotal =
    quincenaMode === "PCT_LIQUIDO"
      ? Math.round(liquidoTotal * quincenaPct)
      : ((await computeFromFichas(tenantId))?.amount ?? 0);

  const payDay = config?.payrollPayDay ?? 30;
  const previredDay = config?.previRedPayDay ?? 10;
  const quincenaDay = config?.quincenaPayDay ?? 15;
  const ivaDay = config?.ivaPayDay ?? 12;

  const milestones: ExpenseMilestoneInput[] = [];
  for (const { y, m } of monthsBetween(fromYmd, toYmd)) {
    if (liquidoTotal > 0)
      milestones.push({ key: "liquido", label: "Sueldos líquidos", dateYmd: ymdOf(y, m, payDay), amountClp: liquidoTotal });
    if (quincenaTotal > 0)
      milestones.push({ key: "quincena", label: "Quincena / anticipos", dateYmd: ymdOf(y, m, quincenaDay), amountClp: quincenaTotal });
    if (previRedTotal > 0)
      milestones.push({ key: "previred", label: "Previred (imposiciones)", dateYmd: ymdOf(y, m, previredDay), amountClp: previRedTotal });
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
  const today = new Date(`${todayYmd}T00:00:00.000Z`);
  for (const { y, m } of monthsBetween(fromYmd, toYmd)) {
    const periodEnd = new Date(Date.UTC(y, m + 1, 1));
    if (periodEnd.getTime() > today.getTime()) continue;
    const payYmd = ymdOf(m === 11 ? y + 1 : y, (m + 1) % 12, ivaDay);
    if (payYmd < fromYmd || payYmd > toYmd) continue;
    const periodo = `${y}-${String(m + 1).padStart(2, "0")}`;
    try {
      const f29 = await computeF29Period(tenantId, periodo);
      if (f29.f29.totalAPagar > 0) {
        milestones.push({
          key: "f29",
          label: `IVA F29 ${periodo}`,
          dateYmd: payYmd,
          amountClp: Math.round(f29.f29.totalAPagar),
        });
      }
    } catch {
      // Período sin datos: omitir, jamás inventar montos.
    }
  }

  // ── DTEs recibidos por pagar ──
  const excluded = new Set(exclusions.map((e) => e.dteId));
  const allAccountIds = [
    ...new Set(
      receivedRaw.flatMap((d) => d.lines.map((l) => l.accountId).filter((x): x is string => !!x)),
    ),
  ];
  const accountToCategory = await bulkResolveCategoriesFromAccounts(tenantId, allAccountIds);

  const receivedDtes: ReceivedDteExpenseInput[] = receivedRaw
    .filter((d) => !excluded.has(d.id))
    .map((d) => {
      let categoryId: string | null = null;
      for (const l of d.lines) {
        if (l.accountId && accountToCategory.has(l.accountId)) {
          categoryId = accountToCategory.get(l.accountId)!.id;
          break;
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
        categoryId,
        issuerName: d.issuerName ?? "",
      };
    });

  return deriveCommittedExpense({
    rows,
    weeks,
    todayYmd,
    milestones,
    receivedDtes,
    categoryCodeById: new Map(categories.map((c) => [c.id, c.code])),
  });
}
