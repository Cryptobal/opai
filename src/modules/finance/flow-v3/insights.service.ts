import "server-only";
import { prisma } from "@/lib/prisma";
import { buildFlowMatrix } from "./matrix.service";
import { addWeeksUTC, toYmd, weekStartYmd, ymdToDate } from "./weeks";

export interface FlowInsightsDto {
  saldoHoy: number | null;
  redWeek: { weekStart: string; balance: number } | null;
  min12: { weekStart: string; balance: number } | null;
  porCobrarTotal: number;
  aging: { alDia: number; d1_15: number; d16_30: number; d30plus: number };
  balanceSeries: Array<{ weekStart: string; label: string; balance: number }>;
  recentSeals: Array<{
    weekEnd: string;
    closedBalance: number;
    projectedBalance: number;
    delta: number;
  }>;
  warnThresholdClp: number;
}

/** Panel read-only: 12 semanas desde hoy + aging DTEs + últimos sellos. */
export async function buildFlowInsights(tenantId: string): Promise<FlowInsightsDto> {
  const today = new Date();
  const fromMonday = weekStartYmd(today);
  const fromDate = ymdToDate(fromMonday)!;
  const toDate = addWeeksUTC(fromDate, 11);

  const matrix = await buildFlowMatrix(tenantId, {
    from: fromDate,
    to: toDate,
    granularity: "week",
  });

  const warn = matrix.warnThreshold ?? 0;
  let redWeek: FlowInsightsDto["redWeek"] = null;
  let min12: FlowInsightsDto["min12"] = null;

  for (let i = 0; i < matrix.balances.length; i++) {
    const balance = matrix.balances[i] ?? 0;
    const weekStart = matrix.columns[i]?.weekStart ?? matrix.columns[i]?.key ?? "";
    if (!weekStart) continue;
    if (min12 == null || balance < min12.balance) {
      min12 = { weekStart, balance };
    }
    if (redWeek == null && balance < 0 && balance < warn) {
      redWeek = { weekStart, balance };
    }
  }

  const saldoHoy = matrix.kpis?.saldoHoy ?? null;

  const dtes = await prisma.financeDte.findMany({
    where: {
      tenantId,
      direction: "ISSUED",
      dteType: { in: [33, 34] },
      siiStatus: { in: ["ACCEPTED", "PENDING", "SENT"] },
      voidedByCreditNoteId: null,
      paymentStatus: { in: ["UNPAID", "PARTIAL", "OVERDUE"] },
    },
    select: { date: true, totalAmount: true, amountPaid: true },
    take: 2000,
  });

  const todayYmd = toYmd(today);
  const aging = { alDia: 0, d1_15: 0, d16_30: 0, d30plus: 0 };
  let porCobrarTotal = 0;
  for (const d of dtes) {
    const pending = Number(d.totalAmount) - Number(d.amountPaid ?? 0);
    if (pending <= 0) continue;
    porCobrarTotal += pending;
    const issue = d.date.toISOString().slice(0, 10);
    const days = Math.max(
      0,
      Math.round(
        (Date.parse(`${todayYmd}T00:00:00Z`) - Date.parse(`${issue}T00:00:00Z`)) /
          86_400_000,
      ),
    );
    if (days <= 0) aging.alDia += pending;
    else if (days <= 15) aging.d1_15 += pending;
    else if (days <= 30) aging.d16_30 += pending;
    else aging.d30plus += pending;
  }

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

  return {
    saldoHoy,
    redWeek,
    min12,
    porCobrarTotal,
    aging,
    balanceSeries: matrix.columns.map((c, i) => ({
      weekStart: c.weekStart,
      label: c.label,
      balance: matrix.balances[i] ?? 0,
    })),
    recentSeals,
    warnThresholdClp: warn,
  };
}
