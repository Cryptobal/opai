import "server-only";
import { prisma } from "@/lib/prisma";
import { getUfValue } from "@/lib/uf";
import {
  deriveCommittedIncome,
  type IssuedDteInput,
  type ScheduledDraftInput,
  type TemplateProjectionInput,
} from "./derive-committed-income";
import type { CommittedByRow, FlowRowRef } from "./types";

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

/**
 * Carga fuentes y deriva el comprometido de ingresos para las filas
 * ACCOUNT_INSTALLATION. Solo lecturas.
 */
export async function loadCommittedIncome(
  tenantId: string,
  rows: FlowRowRef[],
  weeks: string[],
  todayYmd: string,
): Promise<CommittedByRow> {
  const [config, dtes, recurringLinked, templates, exclusions] = await Promise.all([
    prisma.financeCashflowConfig.findUnique({
      where: { tenantId },
      select: { collectionLagDays: true },
    }),
    prisma.financeDte.findMany({
      where: {
        tenantId,
        direction: "ISSUED",
        dteType: { in: [33, 34] },
        siiStatus: { in: ["ACCEPTED", "PENDING", "SENT"] },
        voidedByCreditNoteId: null,
        creditedNetAmount: 0,
        paymentStatus: { in: ["UNPAID", "PARTIAL", "OVERDUE"] },
      },
      select: {
        id: true, folio: true, date: true, dueDate: true,
        totalAmount: true, amountPaid: true,
        crmAccountId: true, installationId: true, receiverName: true,
        recurringTemplateId: true,
      },
    }),
    // Todo DTE colgado de una programación (borrador, emitido o pagado) ocupa
    // su (template, período) para la dedupe de cuotas proyectadas.
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
        totalAmount: true, receiverName: true,
        crmAccountId: true, installationId: true,
        recurringTemplateId: true, billingPeriod: true,
      },
    }),
    prisma.financeDteRecurringTemplate.findMany({
      where: { tenantId, isActive: true, dteType: { in: [33, 34] } },
      select: {
        id: true, name: true, crmAccountId: true, installationId: true,
        frequency: true, dayOfMonth: true, dayOfWeek: true, monthOfYear: true,
        startDate: true, endDate: true, lastRunAt: true, nextRunAt: true,
        facturaTiming: true, facturaDay: true, facturaMesRelativo: true,
        currency: true, lines: true, dteType: true,
        diasCobroDesdeFactura: true,
      },
    }),
    prisma.financeCashflowDteFlowExclusion.findMany({
      where: { tenantId },
      select: { dteId: true },
    }),
  ]);

  const excluded = new Set(exclusions.map((e) => e.dteId));
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
  const diasCobroByTemplate = new Map(templates.map((t) => [t.id, t.diasCobroDesdeFactura]));
  const drafts: ScheduledDraftInput[] = [];
  for (const d of recurringLinked) {
    if (d.recurringTemplateId && d.billingPeriod) {
      coveredPeriods.add(`${d.recurringTemplateId}::${d.billingPeriod}`);
    }
    if (d.siiStatus === "DRAFT" && d.recurringTemplateId && !excluded.has(d.id)) {
      const tplEnd = endDateByTemplate.get(d.recurringTemplateId);
      drafts.push({
        id: d.id,
        templateId: d.recurringTemplateId,
        dateYmd: d.date.toISOString().slice(0, 10),
        totalClp: Number(d.totalAmount),
        receiverName: d.receiverName ?? "",
        crmAccountId: d.crmAccountId,
        installationId: d.installationId,
        templateEndDateYmd: tplEnd ? tplEnd.toISOString().slice(0, 10) : null,
        templateDiasCobro: diasCobroByTemplate.get(d.recurringTemplateId) ?? null,
      });
    }
  }

  const dteInputs: IssuedDteInput[] = dtes
    .filter((d) => !excluded.has(d.id))
    .map((d) => ({
      id: d.id,
      folio: d.folio,
      dateYmd: d.date.toISOString().slice(0, 10),
      dueDateYmd: d.dueDate ? d.dueDate.toISOString().slice(0, 10) : null,
      pendingClp: Number(d.totalAmount) - Number(d.amountPaid),
      crmAccountId: d.crmAccountId,
      installationId: d.installationId,
      receiverName: d.receiverName ?? "",
      templateDiasCobro: d.recurringTemplateId
        ? (diasCobroByTemplate.get(d.recurringTemplateId) ?? null)
        : null,
    }));

  const templateInputs: TemplateProjectionInput[] = templates.map((t) => ({
    id: t.id,
    name: t.name,
    crmAccountId: t.crmAccountId,
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

  return deriveCommittedIncome({
    rows,
    weeks,
    todayYmd,
    dtes: dteInputs,
    drafts,
    templates: templateInputs,
    coveredPeriods,
    collectionLagDays: config?.collectionLagDays ?? undefined,
  });
}
