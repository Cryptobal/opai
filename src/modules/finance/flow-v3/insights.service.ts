import "server-only";
import { prisma } from "@/lib/prisma";
import { buildFlowMatrix } from "./matrix.service";
import {
  ACTIVE_CESSION_STATUSES,
  cessionFromPaymentStatus,
  computeOverdueDays,
  resolveCession,
} from "./overdue";
import {
  addDaysYmd,
  DEFAULT_COLLECTION_LAG_DAYS,
} from "./types";
import { listClosedV3Weeks } from "./weekly-close.adapter";
import {
  addWeeksUTC,
  currentWeekYmd,
  todayYmdChile,
  toYmd,
  weekLabel,
  ymdToDate,
} from "./weeks";
import { countAssignPendingInWindow } from "./unmatched-count";
import { buildAging } from "./insights-aging";
import { buildMonthlyDrifts } from "./insights-drift";
import {
  buildIntegrity,
  buildPanelWeeks,
  buildTopMovers,
  derivePanelKpis,
} from "./insights-series";
import type {
  CarteraPendienteItem,
  FlowInsightsDto,
  OpenMoveWeek,
} from "./insights-types";

export type {
  CarteraPendienteItem,
  FlowInsightsDto,
  OpenMoveWeek,
} from "./insights-types";

/** @deprecated Usar MonthlyDriftRowV2. */
export interface MonthlyDriftCell {
  monthKey: string;
  projected: number;
  real: number;
  delta: number;
}

/** @deprecated */
export interface MonthlyDriftRow {
  rowId: string;
  name: string;
  months: MonthlyDriftCell[];
}

/** Panel read-only: serie 26 sem + aging dual + cartera + sellos + drifts. */
export async function buildFlowInsights(tenantId: string): Promise<FlowInsightsDto> {
  const todayYmd = todayYmdChile();
  const currentMonday = currentWeekYmd();
  const fromMonday = toYmd(addWeeksUTC(ymdToDate(currentMonday)!, -14));
  const fromDate = ymdToDate(fromMonday)!;
  const toDate = addWeeksUTC(ymdToDate(currentMonday)!, 11);

  const matrix = await buildFlowMatrix(tenantId, {
    from: fromDate,
    to: toDate,
    granularity: "week",
  });

  const warn = matrix.warnThreshold ?? 0;
  const bufferClp = Math.max(0, warn);
  const saldoHoy = matrix.kpis?.saldoHoy ?? null;

  const weeks = buildPanelWeeks({
    columns: matrix.columns,
    balances: matrix.balances,
    rows: matrix.rows,
    closedWeeks: matrix.closedWeeks,
    balanceAnchors: matrix.balanceAnchors,
    balanceBreaks: matrix.balanceBreaks,
    currentWeek: currentMonday,
  });

  const kpis = derivePanelKpis(weeks, {
    currentWeek: currentMonday,
    buffer: bufferClp,
    saldoHoy,
  });

  const topMovers = buildTopMovers(matrix.rows, weeks, {
    fromWeek: currentMonday,
    count: 4,
  });

  // Candidatos de "Mover a…" (actual + 11 futuras) para filtrar selladas.
  const moveCandidates: string[] = [];
  {
    let w = ymdToDate(currentMonday)!;
    for (let i = 0; i < 12; i++) {
      moveCandidates.push(toYmd(w));
      w = addWeeksUTC(w, 1);
    }
  }

  const [config, dtes, exclusions, overrides, closedMondays] = await Promise.all([
    prisma.financeCashflowConfig.findUnique({
      where: { tenantId },
      select: { collectionLagDays: true, flowCutoffYmd: true },
    }),
    prisma.financeDte.findMany({
      where: {
        tenantId,
        direction: "ISSUED",
        dteType: { in: [33, 34] },
        siiStatus: { in: ["ACCEPTED", "PENDING", "SENT"] },
        voidedByCreditNoteId: null,
        paymentStatus: { in: ["UNPAID", "PARTIAL", "OVERDUE", "CEDED"] },
      },
      select: {
        id: true,
        folio: true,
        date: true,
        dueDate: true,
        totalAmount: true,
        amountPaid: true,
        paymentStatus: true,
        receiverName: true,
        crmAccountId: true,
      },
      orderBy: { date: "desc" },
      take: 2000,
    }),
    prisma.financeCashflowDteFlowExclusion.findMany({
      where: { tenantId },
      select: { dteId: true },
    }),
    prisma.financeCashflowDteDateOverride.findMany({
      where: { tenantId },
      select: { dteId: true, customDate: true },
    }),
    listClosedV3Weeks(tenantId, moveCandidates),
  ]);

  const excludedIds = new Set(exclusions.map((e) => e.dteId));
  const overrideByDteId = new Map(
    overrides.map((o) => [o.dteId, o.customDate.toISOString().slice(0, 10)]),
  );
  const lagDays = config?.collectionLagDays ?? DEFAULT_COLLECTION_LAG_DAYS;
  const sealedMondays = new Set(closedMondays);
  const cutoffYmd = config?.flowCutoffYmd
    ? config.flowCutoffYmd.toISOString().slice(0, 10)
    : null;

  const dteIds = dtes.filter((d) => !excludedIds.has(d.id)).map((d) => d.id);
  const factoringOps =
    dteIds.length > 0
      ? await prisma.financeFactoringOperation.findMany({
          where: {
            tenantId,
            dteId: { in: dteIds },
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

  const cartera: CarteraPendienteItem[] = [];
  const agingItems: Array<{
    issueYmd: string;
    dueYmd: string;
    pendingClp: number;
    ceded: boolean;
  }> = [];

  for (const d of dtes) {
    if (excludedIds.has(d.id)) continue;
    const issue = d.date.toISOString().slice(0, 10);
    if (cutoffYmd && issue < cutoffYmd) continue;
    const pending = Number(d.totalAmount) - Number(d.amountPaid ?? 0);
    if (pending <= 0) continue;

    const dueYmd = d.dueDate
      ? d.dueDate.toISOString().slice(0, 10)
      : addDaysYmd(issue, lagDays);
    const ops = opsByDte.get(d.id) ?? [];
    const cession =
      resolveCession(
        ops.map((o) => ({
          status: o.status,
          advanceRate: Number(o.advanceRate),
          factoringCompany: o.factoringCompany,
          fechaVencimiento: o.fechaVencimiento,
        })),
      ) ?? cessionFromPaymentStatus(d.paymentStatus);
    const overdueDays = computeOverdueDays({
      dueYmd,
      todayYmd,
      pendingClp: pending,
      paymentStatus: d.paymentStatus,
      cession,
      reconciled: false,
      voided: false,
      isCededRetention: false,
    });
    const ceded = cession?.active === true;

    agingItems.push({
      issueYmd: issue,
      dueYmd,
      pendingClp: pending,
      ceded,
    });

    const placementYmd = overrideByDteId.get(d.id) ?? issue;
    const anchoredWeek = weekStartYmd(ymdToDate(placementYmd) ?? d.date);
    cartera.push({
      dteId: d.id,
      folio: d.folio,
      receiverName: d.receiverName,
      issueDate: issue,
      dueDate: dueYmd,
      overdueDays,
      pendingClp: Math.round(pending),
      anchoredWeek,
      anchoredWeekLabel: weekLabel(anchoredWeek),
      crmAccountId: d.crmAccountId,
      ceded,
      cededPct: ceded ? cession?.pct : undefined,
    });
  }

  cartera.sort((a, b) => b.overdueDays - a.overdueDays || b.pendingClp - a.pendingClp);

  const agingResult = buildAging(agingItems, todayYmd);

  const openMoveWeeks: OpenMoveWeek[] = moveCandidates
    .filter((ws) => !sealedMondays.has(ws))
    .map((ws) => ({ weekStart: ws, label: weekLabel(ws) }));

  const seals = await prisma.financeCashflowWeeklyClose.findMany({
    where: { tenantId },
    orderBy: { weekEndDate: "desc" },
    take: 3,
    select: {
      weekEndDate: true,
      bankBalanceClp: true,
      forcedBalanceClp: true,
      isManual: true,
      projectedBalanceClp: true,
    },
  });

  const recentSeals = seals.map((s) => {
    const closed = Number(
      s.isManual && s.forcedBalanceClp != null ? s.forcedBalanceClp : s.bankBalanceClp,
    );
    const projected = Number(s.projectedBalanceClp ?? 0);
    return {
      weekEnd: s.weekEndDate.toISOString().slice(0, 10),
      closedBalance: closed,
      projectedBalance: projected,
      delta: closed - projected,
    };
  });

  const todayMonth = todayYmd.slice(0, 7);
  const monthKeys: string[] = [];
  {
    const [y, m] = todayMonth.split("-").map(Number);
    for (let i = 3; i >= 0; i--) {
      let mm = m - i;
      let yy = y;
      while (mm <= 0) {
        mm += 12;
        yy -= 1;
      }
      monthKeys.push(`${yy}-${String(mm).padStart(2, "0")}`);
    }
  }

  const monthlyDrifts = buildMonthlyDrifts(matrix.rows, {
    monthKeys,
    currentWeek: currentMonday,
    todayYmd,
  });

  const detail = matrix.openingBalanceDetail;
  const dataHealth = buildIntegrity({
    todayYmd,
    bankAsOfYmd: detail?.lastSnapshotYmd ?? null,
    accounts: detail?.perAccount?.length ?? 0,
    sealedWeeks: matrix.closedWeeks.length,
    balanceBreaks: matrix.balanceBreaks.filter((b) => b != null).length,
    unroutedIncome: matrix.unroutedIncome ?? { count: 0, totalClp: 0 },
    assignPending: countAssignPendingInWindow(matrix.rows),
    dteTruncated: dtes.length === 2000,
  });

  return {
    todayYmd,
    currentWeek: currentMonday,
    saldoHoy,
    bufferClp,
    warnThresholdClp: warn,
    weeks,
    kpis,
    dataHealth,
    topMovers,
    porCobrarTotal: agingResult.totalClp,
    aging: agingResult.byIssue,
    agingByDue: agingResult.byDue,
    agingMeta: { collectionLagDays: lagDays },
    cartera,
    openMoveWeeks,
    recentSeals,
    monthlyDrifts,
    balanceSeries: weeks
      .filter((w) => w.weekStart >= currentMonday)
      .map((w) => ({
        weekStart: w.weekStart,
        label: w.label,
        balance: w.balance,
      })),
    redWeek: kpis.firstNegative,
    min12: kpis.min12,
  };
}
