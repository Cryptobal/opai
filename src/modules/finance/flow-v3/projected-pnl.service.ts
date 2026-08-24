import "server-only";
import { prisma } from "@/lib/prisma";
import type { FinanceSiiStatus } from "@prisma/client";
import { getUfValue } from "@/lib/uf";
import { computePayrollCashForTenant } from "@/modules/finance/cashflow/payroll-cash.service";
import {
  billingPeriodFromAnchor,
  computeNextRunAt,
} from "@/modules/finance/billing/dte-recurring-schedule";
import { expandOccurrenceDates } from "./recurring-plan.service";
import { defaultHorizon, todayYmdChile, toYmd } from "./weeks";
import {
  assembleProjectedPnl,
  buildMonthColumns,
  coveredPeriodKey,
  enumerateMonthKeys,
  netPerRunFromLines,
  recognitionMonthKey,
  type ExtraShiftInput,
  type GavRecurrenceInput,
  type IssuedRevenueInput,
  type PersonnelInput,
  type ProjectedPnlResult,
  type ReceivedCostInput,
  type TemplateProjectionInput,
} from "./projected-pnl";

const ISSUED_TYPES = [33, 34, 39, 41, 56, 61];
const RECEIVED_TYPES = [33, 34, 46, 56, 61];
const ISSUED_STATUSES: FinanceSiiStatus[] = [
  "ACCEPTED",
  "PENDING",
  "SENT",
  "WITH_OBJECTIONS",
];

export interface BuildProjectedPnlOpts {
  from?: Date;
  to?: Date;
  today?: Date;
}

function ymdOf(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function num(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * P&L operativo proyectado del tenant: ingresos por período de facturación,
 * personal por instalación (mes de servicio), costos directos / GAV y
 * prorrateo de GAV por ingresos.
 */
export async function buildProjectedPnl(
  tenantId: string,
  opts: BuildProjectedPnlOpts = {},
): Promise<ProjectedPnlResult> {
  const today = opts.today ?? new Date();
  const horizon = defaultHorizon(today);
  const from = opts.from ?? horizon.from;
  const to = opts.to ?? horizon.to;
  const fromYmd = toYmd(from);
  const toYmdStr = toYmd(to);
  const todayYmd = todayYmdChile(today);
  const monthKeys = enumerateMonthKeys(fromYmd, toYmdStr);
  const months = buildMonthColumns(monthKeys, todayYmd);
  if (months.length === 0) {
    return assembleProjectedPnl({
      months: [],
      issued: [],
      templates: [],
      personnel: [],
      extraShifts: [],
      received: [],
      gavRecurrences: [],
    });
  }

  const firstMonth = monthKeys[0];
  const lastMonth = monthKeys[monthKeys.length - 1];
  const fromDate = new Date(`${firstMonth}-01T00:00:00.000Z`);
  const toDateExclusive = new Date(
    Date.UTC(Number(lastMonth.slice(0, 4)), Number(lastMonth.slice(5, 7)), 1),
  );

  const [
    issuedRaw,
    draftRaw,
    templates,
    payroll,
    tes,
    receivedRaw,
    gavRecs,
    installations,
  ] = await Promise.all([
    prisma.financeDte.findMany({
      where: {
        tenantId,
        direction: "ISSUED",
        dteType: { in: ISSUED_TYPES },
        siiStatus: { in: ISSUED_STATUSES },
        voidedByCreditNoteId: null,
        OR: [
          { billingPeriod: { in: monthKeys } },
          { date: { gte: fromDate, lt: toDateExclusive } },
        ],
      },
      select: {
        dteType: true,
        netAmount: true,
        date: true,
        billingPeriod: true,
        installationId: true,
        recurringTemplateId: true,
      },
    }),
    prisma.financeDte.findMany({
      where: {
        tenantId,
        direction: "ISSUED",
        dteType: { in: [33, 34] },
        siiStatus: "DRAFT",
        voidedByCreditNoteId: null,
        OR: [
          { billingPeriod: { in: monthKeys } },
          { date: { gte: fromDate, lt: toDateExclusive } },
        ],
      },
      select: {
        dteType: true,
        netAmount: true,
        date: true,
        billingPeriod: true,
        installationId: true,
        recurringTemplateId: true,
      },
    }),
    prisma.financeDteRecurringTemplate.findMany({
      where: { tenantId, isActive: true, dteType: { in: [33, 34] } },
      select: {
        id: true,
        installationId: true,
        frequency: true,
        dayOfMonth: true,
        dayOfWeek: true,
        monthOfYear: true,
        startDate: true,
        endDate: true,
        lastRunAt: true,
        nextRunAt: true,
        facturaTiming: true,
        facturaDay: true,
        facturaMesRelativo: true,
        currency: true,
        lines: true,
      },
    }),
    computePayrollCashForTenant(tenantId),
    prisma.opsTurnoExtra.findMany({
      where: {
        tenantId,
        status: "approved",
        date: { gte: fromDate, lt: toDateExclusive },
      },
      select: { installationId: true, date: true, amountClp: true },
    }),
    prisma.financeDte.findMany({
      where: {
        tenantId,
        direction: "RECEIVED",
        dteType: { in: RECEIVED_TYPES },
        date: { gte: fromDate, lt: toDateExclusive },
        NOT: { receptionStatus: { in: ["CLAIMED", "EXPIRED"] } },
      },
      select: {
        dteType: true,
        netAmount: true,
        date: true,
        installationId: true,
      },
    }),
    prisma.financeFlowPlanRecurrence.findMany({
      where: {
        tenantId,
        amountMode: "FIXED",
        row: { tenantId, section: "GAV", archivedAt: null },
      },
      select: {
        amount: true,
        frequency: true,
        dayOfMonth: true,
        startDate: true,
        endDate: true,
        endAfterOccurrences: true,
      },
    }),
    prisma.crmInstallation.findMany({
      where: { tenantId },
      select: { id: true, name: true },
    }),
  ]);

  const names = new Map(installations.map((i) => [i.id, i.name]));

  const issued: IssuedRevenueInput[] = [];
  const covered = new Set<string>();
  const ingestIssued = (
    rows: typeof issuedRaw,
  ) => {
    for (const d of rows) {
      const dateYmd = ymdOf(d.date);
      const period = recognitionMonthKey(d.billingPeriod, dateYmd);
      issued.push({
        dteType: d.dteType,
        netAmount: num(d.netAmount),
        dateYmd,
        billingPeriod: d.billingPeriod,
        installationId: d.installationId,
        recurringTemplateId: d.recurringTemplateId,
      });
      if (d.recurringTemplateId && period) {
        covered.add(coveredPeriodKey(d.recurringTemplateId, period));
      }
    }
  };
  ingestIssued(issuedRaw);
  ingestIssued(draftRaw);

  const someUf = templates.some(
    (t) =>
      t.currency === "UF" ||
      ((t.lines as Array<{ priceCurrency?: string; unitPriceUf?: unknown }> | null) ?? []).some(
        (l) => l.priceCurrency === "UF" || l.unitPriceUf != null,
      ),
  );
  const ufValue = someUf ? await getUfValue().catch(() => null) : null;

  const templateProj: TemplateProjectionInput[] = [];
  for (const t of templates) {
    const netPerRunClp = netPerRunFromLines(t.lines, t.currency, ufValue);
    if (netPerRunClp <= 0) continue;
    const periods: string[] = [];
    let anchor = t.nextRunAt ?? computeNextRunAt(t);
    let guard = 0;
    while (anchor && guard < 130) {
      guard += 1;
      if (t.endDate && anchor > t.endDate) break;
      const period = billingPeriodFromAnchor(anchor);
      if (period > lastMonth) break;
      if (
        period >= firstMonth &&
        !covered.has(coveredPeriodKey(t.id, period))
      ) {
        periods.push(period);
        covered.add(coveredPeriodKey(t.id, period));
      }
      anchor = computeNextRunAt(t, anchor);
    }
    if (periods.length > 0) {
      templateProj.push({
        id: t.id,
        installationId: t.installationId,
        netPerRunClp,
        periods,
      });
    }
  }

  const personnel: PersonnelInput[] = [...payroll.byInstallation.entries()].map(
    ([installationId, b]) => ({
      installationId,
      name: b.name,
      monthlyCostClp: b.costoDirecto,
    }),
  );

  const extraShifts: ExtraShiftInput[] = tes.map((t) => ({
    installationId: t.installationId,
    dateYmd: ymdOf(t.date),
    amountClp: num(t.amountClp),
  }));

  const received: ReceivedCostInput[] = receivedRaw.map((d) => ({
    dteType: d.dteType,
    netAmount: num(d.netAmount),
    dateYmd: ymdOf(d.date),
    installationId: d.installationId,
  }));

  const gavRecurrences: GavRecurrenceInput[] = [];
  const recEnd = `${lastMonth}-28`;
  for (const rec of gavRecs) {
    const startYmd = ymdOf(rec.startDate);
    const endYmd = rec.endDate ? ymdOf(rec.endDate) : recEnd;
    const dates = expandOccurrenceDates(
      rec.frequency,
      startYmd,
      endYmd < recEnd ? endYmd : recEnd,
      rec.dayOfMonth,
      rec.endAfterOccurrences,
    );
    const amount = Math.abs(num(rec.amount));
    for (const d of dates) {
      const monthKey = d.slice(0, 7);
      if (monthKey < firstMonth || monthKey > lastMonth) continue;
      gavRecurrences.push({ monthKey, amountClp: amount });
    }
  }

  return assembleProjectedPnl({
    months,
    issued,
    templates: templateProj,
    personnel,
    extraShifts,
    received,
    gavRecurrences,
    installationNames: names,
  });
}
