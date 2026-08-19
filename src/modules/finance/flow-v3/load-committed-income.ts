import "server-only";
import { prisma } from "@/lib/prisma";
import { cleanRut } from "@/lib/chile-rut";
import { getUfValue } from "@/lib/uf";
import { pickDueDateDays } from "@/modules/finance/billing/dte-due-date";
import {
  deriveCommittedIncome,
  type IssuedDteInput,
  type ScheduledDraftInput,
  type TemplateProjectionInput,
} from "./derive-committed-income";
import { loadScheduledDateOverrides } from "./scheduled-date-override.service";
import {
  ACTIVE_CESSION_STATUSES,
  cessionFromPaymentStatus,
  isCededRetentionName,
  resolveCession,
  type DueDateSource,
} from "./overdue";
import { buildIncomeMatcher } from "./row-match";
import {
  addDaysYmd,
  type CommittedByRow,
  type FlowExcludedDte,
  type FlowRowRef,
} from "./types";

/** pickDueDateDays usa "template"; la planilla muestra "contrato". */
function toPlanillaTermSource(
  source: "explicit" | "template" | "tenant" | "default",
): DueDateSource {
  return source === "template" ? "contrato" : source;
}

/**
 * Origen del término cuando el DTE ya tiene dueDate persistido.
 * Coincide emisión+template → contrato; emisión+tenant lag → tenant; else explícito.
 */
function inferTermFromDueDate(args: {
  issueYmd: string;
  dueYmd: string | null;
  templateDays: number | null;
  tenantLagDays: number | null;
}): { termDays: number; termSource: DueDateSource } {
  const picked = pickDueDateDays({
    templateDays: args.templateDays,
    tenantLagDays: args.tenantLagDays,
  });
  if (!args.dueYmd) {
    return {
      termDays: picked.days,
      termSource: toPlanillaTermSource(picked.source),
    };
  }
  if (
    args.templateDays != null &&
    addDaysYmd(args.issueYmd, args.templateDays) === args.dueYmd
  ) {
    return { termDays: args.templateDays, termSource: "contrato" };
  }
  if (
    args.tenantLagDays != null &&
    addDaysYmd(args.issueYmd, args.tenantLagDays) === args.dueYmd
  ) {
    return { termDays: args.tenantLagDays, termSource: "tenant" };
  }
  // Inferir días desde emisión→due; si no cuadra con cascada ⇒ explícito.
  const inferred = Math.round(
    (Date.parse(`${args.dueYmd}T00:00:00Z`) -
      Date.parse(`${args.issueYmd}T00:00:00Z`)) /
      86_400_000,
  );
  if (Number.isFinite(inferred) && inferred >= 0) {
    if (
      args.templateDays != null &&
      inferred === args.templateDays
    ) {
      return { termDays: inferred, termSource: "contrato" };
    }
    if (args.tenantLagDays != null && inferred === args.tenantLagDays) {
      return { termDays: inferred, termSource: "tenant" };
    }
    return { termDays: inferred, termSource: "explicit" };
  }
  return {
    termDays: picked.days,
    termSource: toPlanillaTermSource(picked.source),
  };
}

const IVA = 1.19;

interface TemplateLineShape {
  quantity?: number | string;
  unitPrice?: number | string;
  unitPriceUf?: number | string;
  discountPct?: number | string;
  priceCurrency?: "CLP" | "UF";
  isExempt?: boolean;
}

/**
 * Bruto CLP de una cuota del template: Σ líneas (qty × precio × (1−disc)),
 * UF→CLP con `ufValue`, +IVA por línea no exenta (dteType 34 = todo exento).
 * Mismo criterio de moneda por línea que `resolveLinePriceCurrency`
 * (dte-recurring.service); acá además se lleva a BRUTO porque la planilla
 * muestra caja (el neto es asunto contable).
 */
export function grossPerRunFromLines(
  rawLines: unknown,
  templateCurrency: string,
  dteType: number,
  ufValue: number | null,
): number {
  const lines = (rawLines as TemplateLineShape[] | null) ?? [];
  let total = 0;
  for (const l of lines) {
    const linePc =
      l.priceCurrency === "UF" || l.priceCurrency === "CLP"
        ? l.priceCurrency
        : templateCurrency === "UF" || l.unitPriceUf != null
          ? "UF"
          : "CLP";
    const qty = Number(l.quantity ?? 1);
    const disc = Number(l.discountPct ?? 0) / 100;
    const unit =
      linePc === "UF" ? Number(l.unitPriceUf ?? 0) * (ufValue ?? 0) : Number(l.unitPrice ?? 0);
    const net = qty * unit * (1 - disc);
    const exempt = dteType === 34 || l.isExempt === true;
    total += exempt ? net : net * IVA;
  }
  return Math.round(total);
}

export interface LoadCommittedIncomeResult {
  committed: CommittedByRow;
  excluded: FlowExcludedDte[];
  /** DTEs emitidos sin fila (panel lateral; no van a la bandeja). */
  unroutedIncome: { count: number; totalClp: number };
}

/**
 * Carga fuentes y deriva el comprometido de ingresos para las filas
 * ACCOUNT_INSTALLATION. Solo lecturas.
 *
 * Fallback RUT: DTEs/borradores/templates con `crmAccountId` null se
 * resuelven contra cuentas CRM del tenant por `receiverRut` normalizado
 * (`cleanRut`). Ante duplicados, gana la cuenta más antigua (createdAt).
 */
export async function loadCommittedIncome(
  tenantId: string,
  rows: FlowRowRef[],
  weeks: string[],
  todayYmd: string,
): Promise<LoadCommittedIncomeResult> {
  const [config, dtes, recurringLinked, templates, exclusions, accounts] = await Promise.all([
    prisma.financeCashflowConfig.findUnique({
      where: { tenantId },
      select: {
        collectionLagDays: true,
        flowCutoffYmd: true,
        bandejaIncomeBankOnly: true,
      },
    }),
    prisma.financeDte.findMany({
      where: {
        tenantId,
        direction: "ISSUED",
        dteType: { in: [33, 34] },
        siiStatus: { in: ["ACCEPTED", "PENDING", "SENT"] },
        voidedByCreditNoteId: null,
        creditedNetAmount: 0,
        // CEDED: factura cedida a factoring — sigue en la planilla (marca
        // secundaria) hasta que el depósito del cesionario la concilie.
        paymentStatus: { in: ["UNPAID", "PARTIAL", "OVERDUE", "CEDED"] },
      },
      select: {
        id: true, folio: true, date: true, dueDate: true,
        totalAmount: true, amountPaid: true, paymentStatus: true,
        crmAccountId: true, installationId: true, receiverName: true,
        receiverRut: true, recurringTemplateId: true, flowRouting: true,
      },
    }),
    prisma.financeDte.findMany({
      where: {
        tenantId,
        direction: "ISSUED",
        recurringTemplateId: { not: null },
        siiStatus: { notIn: ["ANNULLED", "REJECTED"] },
        voidedByCreditNoteId: null,
      },
      select: {
        id: true, siiStatus: true, dteType: true, date: true,
        totalAmount: true, receiverName: true, receiverRut: true,
        crmAccountId: true, installationId: true,
        recurringTemplateId: true, billingPeriod: true,
        proformaStatus: true, estadoPagoStatus: true,
      },
    }),
    prisma.financeDteRecurringTemplate.findMany({
      where: { tenantId, isActive: true, dteType: { in: [33, 34] } },
      select: {
        id: true, name: true, crmAccountId: true, installationId: true,
        receiverRut: true,
        frequency: true, dayOfMonth: true, dayOfWeek: true, monthOfYear: true,
        startDate: true, endDate: true, lastRunAt: true, nextRunAt: true,
        facturaTiming: true, facturaDay: true, facturaMesRelativo: true,
        currency: true, lines: true, dteType: true,
        diasCobroDesdeFactura: true,
      },
    }),
    prisma.financeCashflowDteFlowExclusion.findMany({
      where: { tenantId },
      select: {
        dteId: true, reason: true, createdAt: true,
        dte: {
          select: {
            folio: true, receiverName: true, receiverRut: true,
            crmAccountId: true, installationId: true, recurringTemplateId: true,
          },
        },
      },
    }),
    prisma.crmAccount.findMany({
      where: { tenantId, rut: { not: null } },
      select: { id: true, rut: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  // RUT normalizado → primera cuenta (más antigua).
  const accountByRut = new Map<string, string>();
  for (const a of accounts) {
    if (!a.rut) continue;
    const key = cleanRut(a.rut);
    if (key && !accountByRut.has(key)) accountByRut.set(key, a.id);
  }
  const resolveAccount = (
    crmAccountId: string | null,
    receiverRut: string | null | undefined,
  ): string | null => {
    if (crmAccountId) return crmAccountId;
    if (!receiverRut) return null;
    const key = cleanRut(receiverRut);
    return key ? (accountByRut.get(key) ?? null) : null;
  };

  const excludedIds = new Set(exclusions.map((e) => e.dteId));
  // Corte de cartera (v4.6): emitidos antes del cutoff salen del comprometido.
  const cutoffYmd = config?.flowCutoffYmd
    ? config.flowCutoffYmd.toISOString().slice(0, 10)
    : null;
  const afterCutoff = (d: { date: Date }) =>
    !cutoffYmd || d.date.toISOString().slice(0, 10) >= cutoffYmd;
  const issuedIds = dtes
    .filter((d) => !excludedIds.has(d.id) && afterCutoff(d))
    .map((d) => d.id);
  // Overrides también para borradores (v4.7: mover todo borrador).
  const draftCandidateIds = recurringLinked
    .filter((d) => d.siiStatus === "DRAFT" && !excludedIds.has(d.id))
    .map((d) => d.id);
  const overrideIds = [...new Set([...issuedIds, ...draftCandidateIds])];
  const overrideRows =
    overrideIds.length > 0
      ? await prisma.financeCashflowDteDateOverride.findMany({
          where: { tenantId, dteId: { in: overrideIds } },
          select: { dteId: true, customDate: true },
        })
      : [];
  const overrideByDteId = new Map(
    overrideRows.map((o) => [o.dteId, o.customDate.toISOString().slice(0, 10)]),
  );
  const someUf = templates.some(
    (t) =>
      t.currency === "UF" ||
      ((t.lines as TemplateLineShape[] | null) ?? []).some(
        (l) => l.priceCurrency === "UF" || l.unitPriceUf != null,
      ),
  );
  const ufValue = someUf ? await getUfValue().catch(() => null) : null;

  const coveredPeriods = new Set<string>();
  const endDateByTemplate = new Map(templates.map((t) => [t.id, t.endDate]));
  const diasCobroByTemplate = new Map<string, number | null>(
    templates.map((t) => [t.id, t.diasCobroDesdeFactura]),
  );
  const nameByTemplate = new Map<string, string>(
    templates.map((t) => [t.id, t.name]),
  );

  const referencedTemplateIds = new Set<string>();
  for (const d of dtes) if (d.recurringTemplateId) referencedTemplateIds.add(d.recurringTemplateId);
  for (const d of recurringLinked) if (d.recurringTemplateId) referencedTemplateIds.add(d.recurringTemplateId);
  const missingTemplateIds = [...referencedTemplateIds].filter((id) => !diasCobroByTemplate.has(id));
  if (missingTemplateIds.length > 0) {
    const extra = await prisma.financeDteRecurringTemplate.findMany({
      where: { tenantId, id: { in: missingTemplateIds } },
      select: { id: true, name: true, diasCobroDesdeFactura: true },
    });
    for (const t of extra) {
      diasCobroByTemplate.set(t.id, t.diasCobroDesdeFactura);
      nameByTemplate.set(t.id, t.name);
    }
  }

  // Cesiones activas acotadas a los DTEs ya cargados (mismo patrón que v2).
  const factoringOps =
    issuedIds.length > 0
      ? await prisma.financeFactoringOperation.findMany({
          where: {
            tenantId,
            dteId: { in: issuedIds },
            status: { in: [...ACTIVE_CESSION_STATUSES] },
          },
          select: {
            dteId: true,
            status: true,
            advanceRate: true,
            factoringCompany: true,
            fechaVencimiento: true,
          },
        })
      : [];
  const opsByDte = new Map<string, typeof factoringOps>();
  for (const op of factoringOps) {
    const list = opsByDte.get(op.dteId) ?? [];
    list.push(op);
    opsByDte.set(op.dteId, list);
  }
  const cessionByDte = new Map(
    [...opsByDte.entries()].map(([dteId, ops]) => [
      dteId,
      resolveCession(
        ops.map((o) => ({
          status: o.status,
          advanceRate: Number(o.advanceRate),
          factoringCompany: o.factoringCompany,
          fechaVencimiento: o.fechaVencimiento,
        })),
      ),
    ]),
  );
  const tenantLagDays = config?.collectionLagDays ?? null;

  const drafts: ScheduledDraftInput[] = [];
  for (const d of recurringLinked) {
    if (d.recurringTemplateId && d.billingPeriod) {
      coveredPeriods.add(`${d.recurringTemplateId}::${d.billingPeriod}`);
    }
    if (d.siiStatus === "DRAFT" && d.recurringTemplateId && !excludedIds.has(d.id)) {
      const tplEnd = endDateByTemplate.get(d.recurringTemplateId);
      const sent = (s: string) => ["SENT", "VIEWED", "APPROVED"].includes(s);
      drafts.push({
        id: d.id,
        templateId: d.recurringTemplateId,
        dateYmd: d.date.toISOString().slice(0, 10),
        totalClp: Number(d.totalAmount),
        receiverName: d.receiverName ?? "",
        crmAccountId: resolveAccount(d.crmAccountId, d.receiverRut),
        installationId: d.installationId,
        sentDocs: {
          proforma: sent(d.proformaStatus),
          estadoPago: sent(d.estadoPagoStatus),
        },
        templateEndDateYmd: tplEnd ? tplEnd.toISOString().slice(0, 10) : null,
        templateDiasCobro: diasCobroByTemplate.get(d.recurringTemplateId) ?? null,
        overrideDateYmd: overrideByDteId.get(d.id) ?? null,
      });
    }
  }

  const dteInputs: IssuedDteInput[] = dtes
    .filter((d) => !excludedIds.has(d.id) && afterCutoff(d))
    .map((d) => {
      const dateYmd = d.date.toISOString().slice(0, 10);
      const dueDateYmd = d.dueDate ? d.dueDate.toISOString().slice(0, 10) : null;
      const templateDiasCobro = d.recurringTemplateId
        ? (diasCobroByTemplate.get(d.recurringTemplateId) ?? null)
        : null;
      const templateName = d.recurringTemplateId
        ? (nameByTemplate.get(d.recurringTemplateId) ?? null)
        : null;
      const { termDays, termSource } = inferTermFromDueDate({
        issueYmd: dateYmd,
        dueYmd: dueDateYmd,
        templateDays: templateDiasCobro,
        tenantLagDays,
      });
      const cession =
        cessionByDte.get(d.id) ?? cessionFromPaymentStatus(d.paymentStatus);
      return {
        id: d.id,
        folio: d.folio,
        dateYmd,
        dueDateYmd,
        overrideDateYmd: overrideByDteId.get(d.id) ?? null,
        pendingClp: Number(d.totalAmount) - Number(d.amountPaid),
        crmAccountId: resolveAccount(d.crmAccountId, d.receiverRut),
        installationId: d.installationId,
        recurringTemplateId: d.recurringTemplateId,
        flowRouting: d.flowRouting,
        receiverName: d.receiverName ?? "",
        templateDiasCobro,
        paymentStatus: d.paymentStatus,
        cession,
        ceded: cession?.active === true,
        isCededRetention: isCededRetentionName(templateName),
        termDays,
        termSource,
      };
    });

  const templateInputs: TemplateProjectionInput[] = templates.map((t) => ({
    id: t.id,
    name: t.name,
    crmAccountId: resolveAccount(t.crmAccountId, t.receiverRut),
    installationId: t.installationId,
    frequency: t.frequency,
    dayOfMonth: t.dayOfMonth,
    dayOfWeek: t.dayOfWeek,
    monthOfYear: t.monthOfYear,
    startDate: t.startDate,
    endDate: t.endDate,
    lastRunAt: t.lastRunAt,
    nextRunAt: t.nextRunAt,
    facturaTiming: t.facturaTiming,
    facturaDay: t.facturaDay,
    facturaMesRelativo: t.facturaMesRelativo,
    grossPerRunClp: grossPerRunFromLines(t.lines, t.currency, t.dteType, ufValue),
    diasCobro: t.diasCobroDesdeFactura,
  }));

  const scheduledOverrides = await loadScheduledDateOverrides(
    tenantId,
    templates.map((t) => t.id),
  );

  const derived = deriveCommittedIncome({
    rows,
    weeks,
    todayYmd,
    dtes: dteInputs,
    drafts,
    templates: templateInputs,
    coveredPeriods,
    scheduledOverrides,
    collectionLagDays: config?.collectionLagDays ?? undefined,
    // Schema default true; sin config ⇒ bank-only (cartola-first).
    bandejaIncomeBankOnly: config?.bandejaIncomeBankOnly !== false,
  });

  const matchRow = buildIncomeMatcher(rows);
  const excluded: FlowExcludedDte[] = exclusions.map((e) => {
    const accId = resolveAccount(e.dte.crmAccountId, e.dte.receiverRut);
    return {
      dteId: e.dteId,
      folio: e.dte.folio,
      label: e.dte.receiverName ?? "",
      reason: e.reason,
      createdAt: e.createdAt.toISOString(),
      rowId: matchRow(accId, e.dte.installationId, e.dte.recurringTemplateId),
    };
  });

  const unroutedIncome = {
    count: derived.unrouted.length,
    totalClp: derived.unrouted.reduce((s, u) => s + u.monto, 0),
  };

  return { committed: derived.committed, excluded, unroutedIncome };
}
