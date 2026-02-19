/**
 * CRM - Dashboard ejecutivo con reportes y métricas
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { resolvePagePerms, canView, hasModuleAccess } from '@/lib/permissions-server';
import { getDefaultTenantId } from '@/lib/tenant';
import { prisma } from '@/lib/prisma';
import { PageHeader } from '@/components/opai';
import {
  LeadsByMonthChart,
  QuotesByMonthChart,
  LeadsBySourceChart,
  type LeadByMonthRow,
  type QuotesByMonthRow,
  type LeadBySourceRow,
} from '@/components/crm/CrmDashboardCharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { TrendingUp, TrendingDown } from 'lucide-react';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function formatMonthLabel(dateStr: string): string {
  const d = new Date(dateStr);
  return `${MONTH_LABELS[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`;
}

function formatLeadSource(source: string | null): string {
  if (!source) return 'Otros';
  if (source === 'web_cotizador') return 'Cotizador Web';
  if (source === 'web_cotizador_inteligente') return 'Cotizador IA';
  if (source === 'email_forward') return 'Email';
  return source;
}

function toPercent(value: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((value / total) * 100);
}

export default async function CRMPage() {
  const session = await auth();
  if (!session?.user) redirect('/opai/login?callbackUrl=/crm');
  const perms = await resolvePagePerms(session.user);
  if (!hasModuleAccess(perms, 'crm')) redirect('/hub');
  const tenantId = session.user?.tenantId ?? (await getDefaultTenantId());
  const now = new Date();
  const twelveMonthsAgo = new Date(now);
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
  twelveMonthsAgo.setDate(1);
  twelveMonthsAgo.setHours(0, 0, 0, 0);
  const twentyFourMonthsAgo = new Date(now);
  twentyFourMonthsAgo.setMonth(twentyFourMonthsAgo.getMonth() - 24);
  twentyFourMonthsAgo.setDate(1);
  twentyFourMonthsAgo.setHours(0, 0, 0, 0);
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

  // All queries in parallel (CRM only, no ops)
  const [
    leadsThisMonth,
    leadsPrevMonth,
    leadsPending,
    leadsInReview,
    leadsApproved12m,
    leadsRejected12m,
    accountsActive,
    installationsActive,
    openDealsCount,
    openDealsAmountResult,
    leadsCreated30,
    leadsConverted30,
    proposalsSent30,
    wonDealsWithProposal30Rows,
    leadsByMonthRaw,
    quotesByMonthRaw,
    leadsBySourceGroup,
  ] = await Promise.all([
    prisma.crmLead.count({ where: { tenantId, createdAt: { gte: startOfThisMonth } } }),
    prisma.crmLead.count({ where: { tenantId, createdAt: { gte: startOfPrevMonth, lte: endOfPrevMonth } } }),
    prisma.crmLead.count({ where: { tenantId, status: 'pending' } }),
    prisma.crmLead.count({ where: { tenantId, status: 'in_review' } }),
    prisma.crmLead.count({ where: { tenantId, status: 'approved', createdAt: { gte: twelveMonthsAgo } } }),
    prisma.crmLead.count({ where: { tenantId, status: 'rejected', createdAt: { gte: twelveMonthsAgo } } }),
    prisma.crmAccount.count({ where: { tenantId, status: 'client_active' } }),
    prisma.crmInstallation.count({ where: { tenantId, isActive: true } }),
    prisma.crmDeal.count({ where: { tenantId, status: 'open' } }),
    prisma.crmDeal.aggregate({ where: { tenantId, status: 'open' }, _sum: { amount: true } }),
    prisma.crmLead.count({ where: { tenantId, createdAt: { gte: thirtyDaysAgo } } }),
    prisma.crmLead.count({ where: { tenantId, createdAt: { gte: thirtyDaysAgo }, convertedDealId: { not: null } } }),
    prisma.crmDeal.count({ where: { tenantId, proposalSentAt: { gte: thirtyDaysAgo } } }),
    prisma.crmDealStageHistory.findMany({
      where: { tenantId, changedAt: { gte: thirtyDaysAgo }, toStage: { is: { isClosedWon: true } }, deal: { is: { proposalSentAt: { not: null } } } },
      select: { dealId: true },
      distinct: ['dealId'],
    }),
    prisma.$queryRaw<Array<{ month: Date; status: string; count: bigint }>>`
      SELECT date_trunc('month', created_at)::date as month, status, COUNT(*)::bigint as count
      FROM crm.leads WHERE tenant_id = ${tenantId} AND created_at >= ${twelveMonthsAgo}
      GROUP BY 1, 2 ORDER BY 1
    `,
    prisma.$queryRaw<Array<{ month: Date; count: bigint }>>`
      SELECT date_trunc('month', proposal_sent_at)::date as month, COUNT(*)::bigint as count
      FROM crm.deals WHERE tenant_id = ${tenantId} AND proposal_sent_at >= ${twentyFourMonthsAgo}
      GROUP BY 1 ORDER BY 1
    `,
    prisma.crmLead.groupBy({ by: ['source'], where: { tenantId, createdAt: { gte: twelveMonthsAgo } }, _count: true }),
  ]);

  // Derived metrics
  const wonDealsWithProposal30 = wonDealsWithProposal30Rows.length;
  const leadToDealRate30 = toPercent(leadsConverted30, leadsCreated30);
  const leadsMonthDelta = leadsPrevMonth > 0 ? Math.round(((leadsThisMonth - leadsPrevMonth) / leadsPrevMonth) * 100) : 0;
  const openDealsAmountFormatted =
    openDealsAmountResult._sum.amount != null
      ? new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Number(openDealsAmountResult._sum.amount))
      : '$0';

  // Funnel
  const funnel = [
    { label: 'Leads nuevos', value: leadsCreated30, rate: null as number | null },
    { label: 'Convertidos', value: leadsConverted30, rate: toPercent(leadsConverted30, leadsCreated30) },
    { label: 'Propuestas', value: proposalsSent30, rate: toPercent(proposalsSent30, leadsConverted30) },
    { label: 'Ganados', value: wonDealsWithProposal30, rate: toPercent(wonDealsWithProposal30, proposalsSent30) },
  ];

  // Process leads by month
  const monthMap = new Map<string, { pending: number; in_review: number; approved: number; rejected: number }>();
  for (const row of leadsByMonthRaw) {
    const key = row.month instanceof Date ? row.month.toISOString().slice(0, 7) : String(row.month).slice(0, 7);
    if (!monthMap.has(key)) monthMap.set(key, { pending: 0, in_review: 0, approved: 0, rejected: 0 });
    const c = Number(row.count);
    const s = row.status ?? 'pending';
    const m = monthMap.get(key)!;
    if (s === 'pending') m.pending = c;
    else if (s === 'in_review') m.in_review = c;
    else if (s === 'approved') m.approved = c;
    else if (s === 'rejected') m.rejected = c;
  }
  const leadsByMonthData: LeadByMonthRow[] = Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([monthKey, c]) => ({
      month: monthKey,
      monthLabel: formatMonthLabel(monthKey + '-01'),
      ...c,
      total: c.pending + c.in_review + c.approved + c.rejected,
    }));

  // Process quotes by month
  const quotesByMonthData: QuotesByMonthRow[] = quotesByMonthRaw.map((row) => {
    const d = row.month instanceof Date ? row.month : new Date(row.month);
    const mk = d.toISOString().slice(0, 7);
    return { month: mk, monthLabel: formatMonthLabel(mk + '-01'), count: Number(row.count) };
  });

  // Process leads by source
  const getSourceCount = (r: (typeof leadsBySourceGroup)[number]) =>
    typeof r._count === 'number' ? r._count : (r._count as Record<string, number>)['source'] ?? 0;
  const leadsBySourceUnsorted: LeadBySourceRow[] = leadsBySourceGroup.map((r) => ({
    source: r.source ?? 'otros',
    sourceLabel: formatLeadSource(r.source),
    count: getSourceCount(r),
    percent: 0,
  }));
  const totalSrc = leadsBySourceUnsorted.reduce((s, r) => s + r.count, 0);
  const leadsBySourceData = leadsBySourceUnsorted
    .map((r) => ({ ...r, percent: toPercent(r.count, totalSrc) }))
    .sort((a, b) => b.count - a.count);

  const totalLeads12m = leadsByMonthData.reduce((s, r) => s + r.total, 0);
  const totalQuotes24m = quotesByMonthData.reduce((s, r) => s + r.count, 0);

  return (
    <div className="space-y-6 min-w-0">
      <PageHeader title="CRM" description="Pipeline comercial y gestión de clientes" />
      {/* ─── Resumen ejecutivo ─── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 min-w-0">
        <Link href="/crm/leads" className="group min-w-0">
          <div className="rounded-xl border border-border/60 bg-card p-4 transition-all hover:border-primary/30 hover:bg-primary/[0.03] min-w-0 overflow-hidden">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Leads este mes</p>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-semibold tabular-nums tracking-tight">{leadsThisMonth}</span>
              {leadsMonthDelta !== 0 && (
                <span className={`flex items-center gap-0.5 text-xs font-medium ${leadsMonthDelta > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {leadsMonthDelta > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {leadsMonthDelta > 0 ? '+' : ''}{leadsMonthDelta}%
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground/60">{leadsPrevMonth} mes anterior</p>
          </div>
        </Link>

        <div className="rounded-xl border border-border/60 bg-card p-4 min-w-0 overflow-hidden">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Estado leads</p>
          <div className="mt-2 flex items-baseline gap-4">
            <div>
              <span className="text-2xl font-semibold tabular-nums tracking-tight text-amber-400">{leadsPending}</span>
              <p className="text-[10px] text-muted-foreground/60">Pendientes</p>
            </div>
            <div>
              <span className="text-2xl font-semibold tabular-nums tracking-tight text-blue-400">{leadsInReview}</span>
              <p className="text-[10px] text-muted-foreground/60">En revisión</p>
            </div>
          </div>
          <div className="mt-2 flex gap-3 text-xs text-muted-foreground/60">
            <span><span className="font-medium text-emerald-400/80">{leadsApproved12m}</span> aprobados</span>
            <span><span className="font-medium text-red-400/80">{leadsRejected12m}</span> rechazados</span>
          </div>
        </div>

        <Link href="/crm/accounts" className="group min-w-0">
          <div className="rounded-xl border border-border/60 bg-card p-4 transition-all hover:border-primary/30 hover:bg-primary/[0.03] min-w-0 overflow-hidden">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Portafolio activo</p>
            <div className="mt-2 flex items-baseline gap-4">
              <div>
                <span className="text-3xl font-semibold tabular-nums tracking-tight">{accountsActive}</span>
                <p className="text-[10px] text-muted-foreground/60">Cuentas</p>
              </div>
              <div>
                <span className="text-3xl font-semibold tabular-nums tracking-tight">{installationsActive}</span>
                <p className="text-[10px] text-muted-foreground/60">Instalaciones</p>
              </div>
            </div>
          </div>
        </Link>

        <Link href="/crm/deals" className="group min-w-0">
          <div className="rounded-xl border border-border/60 bg-card p-4 transition-all hover:border-primary/30 hover:bg-primary/[0.03] min-w-0 overflow-hidden">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Pipeline abierto</p>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-semibold tabular-nums tracking-tight">{openDealsCount}</span>
              <span className="text-xs text-muted-foreground">negocios</span>
            </div>
            <p className="mt-1 text-xs font-medium text-primary/80">{openDealsAmountFormatted}</p>
          </div>
        </Link>
      </div>

      {/* ─── Gráficos históricos ─── */}
      <div className="grid gap-4 lg:grid-cols-2 min-w-0">
        <Card className="border-border/60 min-w-0 overflow-hidden">
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <CardTitle className="text-sm font-medium">Leads recibidos</CardTitle>
                <CardDescription className="text-xs">Últimos 12 meses por estado</CardDescription>
              </div>
              <span className="text-2xl font-semibold tabular-nums tracking-tight">{totalLeads12m}</span>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <LeadsByMonthChart data={leadsByMonthData} />
          </CardContent>
        </Card>

        <Card className="border-border/60 min-w-0 overflow-hidden">
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <CardTitle className="text-sm font-medium">Cotizaciones enviadas</CardTitle>
                <CardDescription className="text-xs">Últimos 24 meses</CardDescription>
              </div>
              <span className="text-2xl font-semibold tabular-nums tracking-tight">{totalQuotes24m}</span>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <QuotesByMonthChart data={quotesByMonthData} />
          </CardContent>
        </Card>
      </div>

      {/* ─── Fuente + Embudo ─── */}
      <div className="grid gap-4 lg:grid-cols-2 min-w-0">
        <Card className="border-border/60 min-w-0 overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Origen de leads</CardTitle>
            <CardDescription className="text-xs">Distribución últimos 12 meses</CardDescription>
          </CardHeader>
          <CardContent>
            <LeadsBySourceChart data={leadsBySourceData} />
          </CardContent>
        </Card>

        <Card className="border-border/60 min-w-0 overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Embudo comercial</CardTitle>
            <CardDescription className="text-xs">Conversión últimos 30 días</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {funnel.map((step, i) => {
                const maxVal = Math.max(1, ...funnel.map((f) => f.value));
                const widthPct = step.value > 0 ? Math.max(8, (step.value / maxVal) * 100) : 4;
                return (
                  <div key={step.label}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{step.label}</span>
                      <div className="flex items-center gap-2">
                        {step.rate !== null && <span className="text-muted-foreground/50">{step.rate}%</span>}
                        <span className="font-semibold tabular-nums">{step.value}</span>
                      </div>
                    </div>
                    <div className="h-7 w-full overflow-hidden rounded-md bg-muted/30">
                      <div
                        className="flex h-full items-center rounded-md transition-all"
                        style={{
                          width: `${widthPct}%`,
                          background: i === 0 ? 'rgba(29,185,144,0.2)' : i === 1 ? 'rgba(29,185,144,0.35)' : i === 2 ? 'rgba(29,185,144,0.5)' : 'rgba(29,185,144,0.7)',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
              <div className="mt-4 flex items-center justify-between rounded-lg border border-border/40 px-3 py-2">
                <span className="text-xs text-muted-foreground">Tasa lead a negocio</span>
                <span className="text-sm font-semibold text-primary">{leadToDealRate30}%</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
