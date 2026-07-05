/**
 * Servicio compartido de métricas comerciales (Fase 6). Centraliza el cálculo
 * que vivía inline en `crm/page.tsx` para que el dashboard (con toggle 3/6/12m)
 * y el scorecard de Slack usen EXACTAMENTE la misma fuente. `tenantId` en cada
 * query. `months ∈ {3,6,12}`.
 */

import { prisma } from "@/lib/prisma";

export type MetricsWindow = 3 | 6 | 12;

export interface LeadMonthRow {
  month: string;
  monthLabel: string;
  pending: number;
  in_review: number;
  approved: number;
  rejected: number;
  total: number;
}
export interface QuoteMonthRow {
  month: string;
  monthLabel: string;
  count: number;
}
export interface CommercialMetrics {
  months: MetricsWindow;
  leadsByMonth: LeadMonthRow[];
  quotesByMonth: QuoteMonthRow[];
  totalLeads: number;
  totalQuotes: number;
  avgLeadsPerMonth: number;
  avgQuotesPerMonth: number;
  conversion: number; // % lead → negocio en la ventana
  pipeline: { openCount: number; openAmount: number };
}

const MONTH_LABELS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
function monthLabel(monthKey: string): string {
  const d = new Date(`${monthKey}-01`);
  return `${MONTH_LABELS[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`;
}

export function normalizeWindow(raw: unknown): MetricsWindow {
  const n = typeof raw === "string" ? Number.parseInt(raw, 10) : typeof raw === "number" ? raw : NaN;
  return n === 3 || n === 6 ? n : 12;
}

export async function getCommercialMetrics(tenantId: string, months: MetricsWindow): Promise<CommercialMetrics> {
  const since = new Date();
  since.setMonth(since.getMonth() - months);
  since.setDate(1);
  since.setHours(0, 0, 0, 0);

  const [leadsRaw, quotesRaw, leadsCreated, leadsConverted, openAgg] = await Promise.all([
    prisma.$queryRaw<Array<{ month: Date; status: string; count: bigint }>>`
      SELECT date_trunc('month', created_at)::date as month, status, COUNT(*)::bigint as count
      FROM crm.leads WHERE tenant_id = ${tenantId} AND created_at >= ${since}
      GROUP BY 1, 2 ORDER BY 1
    `,
    prisma.$queryRaw<Array<{ month: Date; count: bigint }>>`
      SELECT date_trunc('month', proposal_sent_at)::date as month, COUNT(*)::bigint as count
      FROM crm.deals WHERE tenant_id = ${tenantId} AND proposal_sent_at >= ${since}
      GROUP BY 1 ORDER BY 1
    `,
    prisma.crmLead.count({ where: { tenantId, createdAt: { gte: since } } }),
    prisma.crmLead.count({ where: { tenantId, createdAt: { gte: since }, convertedDealId: { not: null } } }),
    prisma.crmDeal.aggregate({ where: { tenantId, status: "open" }, _sum: { amount: true }, _count: { _all: true } }),
  ]);

  // Leads por mes por estado.
  const leadMap = new Map<string, { pending: number; in_review: number; approved: number; rejected: number }>();
  for (const row of leadsRaw) {
    const key = row.month instanceof Date ? row.month.toISOString().slice(0, 7) : String(row.month).slice(0, 7);
    if (!leadMap.has(key)) leadMap.set(key, { pending: 0, in_review: 0, approved: 0, rejected: 0 });
    const m = leadMap.get(key)!;
    const c = Number(row.count);
    const s = row.status ?? "pending";
    if (s === "pending") m.pending = c;
    else if (s === "in_review") m.in_review = c;
    else if (s === "approved") m.approved = c;
    else if (s === "rejected") m.rejected = c;
  }
  const leadsByMonth: LeadMonthRow[] = [...leadMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, c]) => ({ month, monthLabel: monthLabel(month), ...c, total: c.pending + c.in_review + c.approved + c.rejected }));

  const quotesByMonth: QuoteMonthRow[] = quotesRaw.map((row) => {
    const d = row.month instanceof Date ? row.month : new Date(row.month);
    const mk = d.toISOString().slice(0, 7);
    return { month: mk, monthLabel: monthLabel(mk), count: Number(row.count) };
  });

  const totalLeads = leadsByMonth.reduce((s, r) => s + r.total, 0);
  const totalQuotes = quotesByMonth.reduce((s, r) => s + r.count, 0);
  const round1 = (n: number) => Math.round(n * 10) / 10;

  return {
    months,
    leadsByMonth,
    quotesByMonth,
    totalLeads,
    totalQuotes,
    avgLeadsPerMonth: round1(totalLeads / months),
    avgQuotesPerMonth: round1(totalQuotes / months),
    conversion: leadsCreated > 0 ? Math.round((leadsConverted / leadsCreated) * 100) : 0,
    pipeline: { openCount: openAgg._count._all, openAmount: Number(openAgg._sum.amount ?? 0) },
  };
}
