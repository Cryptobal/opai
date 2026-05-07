import { prisma } from "@/lib/prisma";
import type {
  DashboardKpis,
  FinanceReportFilters,
  FinanceReportPeriod,
} from "./shared/types";
import { getSalesMatrix } from "./sales-matrix.service";
import { getIncomeStatement } from "./income-statement.service";
import { buildPeriod, parseISODate, previousPeriod } from "./shared/period.helper";
import { decimalToNumber, deltaPct, safePct } from "./shared/decimal";

const TONE_PALETTE = ["#8B5CF6", "#3B82F6", "#10B981", "#F59E0B", "#F43F5E"];

export async function getDashboardKpis(
  tenantId: string,
  period: FinanceReportPeriod,
  filters: FinanceReportFilters = {}
): Promise<DashboardKpis> {
  const prev = previousPeriod(period);
  const [sales, salesPrev, eerr, eerrPrev] = await Promise.all([
    getSalesMatrix(tenantId, period, filters),
    getSalesMatrix(tenantId, prev, filters),
    getIncomeStatement(tenantId, period, filters),
    getIncomeStatement(tenantId, prev, filters),
  ]);

  const asOf = parseISODate(period.to);

  const [arPending, apPending] = await Promise.all([
    prisma.financeDte.aggregate({
      where: {
        tenantId,
        direction: "ISSUED",
        paymentStatus: { in: ["UNPAID", "PARTIAL", "OVERDUE"] },
        date: { lte: asOf },
      },
      _sum: { amountPending: true },
      _count: { id: true },
    }),
    prisma.financeDte.aggregate({
      where: {
        tenantId,
        direction: "RECEIVED",
        paymentStatus: { in: ["UNPAID", "PARTIAL", "OVERDUE"] },
        date: { lte: asOf },
      },
      _sum: { amountPending: true },
      _count: { id: true },
    }),
  ]);

  const yearStart = new Date(asOf.getFullYear(), 0, 1);
  const ytdDays = Math.max(
    1,
    Math.round((asOf.getTime() - yearStart.getTime()) / (24 * 3600 * 1000))
  );
  const ytdSalesAggr = await getSalesMatrix(tenantId, buildPeriod("ytd", asOf), filters);
  const arValue = decimalToNumber(arPending._sum.amountPending);
  const dso = ytdSalesAggr.grandTotal > 0 ? (arValue / ytdSalesAggr.grandTotal) * ytdDays : 0;

  // Trend mensual últimos 12 meses
  const trend: DashboardKpis["trendMonthly"] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(asOf.getFullYear(), asOf.getMonth() - i, 15);
    const monthPeriod = buildPeriod("month", d);
    const [sM, eM] = await Promise.all([
      getSalesMatrix(tenantId, monthPeriod, filters),
      getIncomeStatement(tenantId, monthPeriod, filters),
    ]);
    trend.push({
      month: monthPeriod.label.split(" ")[0].slice(0, 3),
      revenue: sM.grandTotal,
      expense: eM.cogs.total + eM.opex.total,
      margin: sM.grandTotal - (eM.cogs.total + eM.opex.total),
    });
  }

  const top5 = sales.rows.slice(0, 5).map((r, i) => ({
    id: r.id,
    name: r.label,
    total: r.total,
    pct: safePct(r.total, sales.grandTotal),
    color: TONE_PALETTE[i % TONE_PALETTE.length],
  }));
  const top5Total = top5.reduce((a, x) => a + x.total, 0);
  const hhi = sales.rows.reduce(
    (a, r) => a + Math.pow(r.total / Math.max(1, sales.grandTotal), 2),
    0
  );

  return {
    period,
    revenue: { value: sales.grandTotal, deltaPct: deltaPct(sales.grandTotal, salesPrev.grandTotal) },
    ebitda: {
      value: eerr.ebitda,
      deltaPct: deltaPct(eerr.ebitda, eerrPrev.ebitda),
      marginPct: safePct(eerr.ebitda, sales.grandTotal),
    },
    netIncome: {
      value: eerr.netIncome,
      deltaPct: deltaPct(eerr.netIncome, eerrPrev.netIncome),
      marginPct: safePct(eerr.netIncome, sales.grandTotal),
    },
    dso: { value: Math.round(dso), deltaPct: 0 },
    accountsReceivable: {
      value: arValue,
      deltaPct: 0,
      activeInvoices: arPending._count.id,
    },
    accountsPayable: {
      value: decimalToNumber(apPending._sum.amountPending),
      deltaPct: 0,
      activeInvoices: apPending._count.id,
    },
    topClientsConcentration: {
      topNTotal: top5Total,
      pct: safePct(top5Total, sales.grandTotal),
      hhi: Number(hhi.toFixed(3)),
    },
    trendMonthly: trend,
    topClients: top5,
  };
}
