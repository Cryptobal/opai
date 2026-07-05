/**
 * CRM - Dashboard ejecutivo con reportes y métricas
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { resolvePagePerms, canView, hasModuleAccess } from '@/lib/permissions-server';
import { prisma } from '@/lib/prisma';
import { PageHero, Stat, StatGrid } from '@/components/opai-ds';
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
import { Users, AlertTriangle, Building2, TrendingUp, BarChart3 } from 'lucide-react';
import { getCommercialMetrics, normalizeWindow } from '@/modules/crm/analytics/commercial-metrics';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

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

export default async function CRMPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const session = await auth();
  if (!session?.user) redirect('/opai/login?callbackUrl=/crm');
  const perms = await resolvePagePerms(session.user);
  if (!hasModuleAccess(perms, 'crm')) redirect('/hub');
  const tenantId = session.user.tenantId;
  const period = normalizeWindow((await searchParams)?.period);
  const metrics = await getCommercialMetrics(tenantId, period);
  const now = new Date();
  const twelveMonthsAgo = new Date(now);
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
  twelveMonthsAgo.setDate(1);
  twelveMonthsAgo.setHours(0, 0, 0, 0);
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
    leadsBySourceGroup,
  ] = await Promise.all([
    prisma.crmLead.count({ where: { tenantId, createdAt: { gte: startOfThisMonth } } }),
    prisma.crmLead.count({ where: { tenantId, createdAt: { gte: startOfPrevMonth, lte: endOfPrevMonth } } }),
    prisma.crmLead.count({ where: { tenantId, status: 'pending' } }),
    prisma.crmLead.count({ where: { tenantId, status: 'in_review' } }),
    prisma.crmLead.count({ where: { tenantId, status: 'approved', createdAt: { gte: twelveMonthsAgo } } }),
    prisma.crmLead.count({ where: { tenantId, status: 'rejected', createdAt: { gte: twelveMonthsAgo } } }),
    prisma.crmAccount.count({ where: { tenantId, status: 'client_active' } }),
    prisma.crmInstallation.count({ where: { tenantId, status: "active" } }),
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

  // Leads/cotizaciones por mes: del servicio compartido (ventana = period).
  const leadsByMonthData: LeadByMonthRow[] = metrics.leadsByMonth;
  const quotesByMonthData: QuotesByMonthRow[] = metrics.quotesByMonth;

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

  const totalLeads12m = metrics.totalLeads;
  const totalQuotes24m = metrics.totalQuotes;
  const periodLabel = `${period}m`;
  const PERIOD_OPTS: Array<3 | 6 | 12> = [3, 6, 12];

  return (
    <div className="space-y-4 sm:space-y-6 min-w-0 overflow-x-hidden">
      <PageHero
        icon={<BarChart3 />}
        iconTone="violet"
        title="Pipeline comercial"
        subtitle="y gestión de clientes"
        description="Resumen ejecutivo de leads, cuentas activas, pipeline abierto y conversión."
      />
      {/* ─── Resumen ejecutivo ─── */}
      <StatGrid lgCols={4}>
        <Link href="/crm/leads" className="min-w-0">
          <Stat
            label="Leads este mes"
            value={leadsThisMonth}
            icon={<Users />}
            trend={leadsMonthDelta !== 0 ? leadsMonthDelta : undefined}
            hint={`${leadsPrevMonth} mes anterior`}
            className="h-full transition-all hover:ring-2 hover:ring-primary/25"
          />
        </Link>
        <Stat
          label="Estado leads"
          value={`${leadsPending + leadsInReview}`}
          icon={<AlertTriangle />}
          hint={`${leadsPending} pendientes · ${leadsInReview} en revisión`}
          variant="warn"
        />
        <Link href="/crm/accounts" className="min-w-0">
          <Stat
            label="Portafolio activo"
            value={accountsActive}
            icon={<Building2 />}
            hint={`${installationsActive} instalaciones`}
            className="h-full transition-all hover:ring-2 hover:ring-primary/25"
          />
        </Link>
        <Link href="/crm/deals" className="min-w-0">
          <Stat
            label="Pipeline abierto"
            value={openDealsCount}
            icon={<TrendingUp />}
            hint={openDealsAmountFormatted}
            className="h-full transition-all hover:ring-2 hover:ring-primary/25"
          />
        </Link>
      </StatGrid>

      {/* ─── Gráficos históricos ─── */}
      {/* Toggle de ventana 3m/6m/12m (tokens DS v3; el estado vive en ?period). */}
      <div className="flex items-center justify-end">
        <div className="inline-flex items-center gap-1 rounded-lg border border-border/60 bg-muted/30 p-1">
          {PERIOD_OPTS.map((p) => (
            <Link
              key={p}
              href={`/crm?period=${p}`}
              scroll={false}
              className={`rounded-md px-3 py-1 text-sm font-medium tabular-nums transition-colors ${
                p === period ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {p}m
            </Link>
          ))}
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2 min-w-0">
        <Card className="border-border/60 min-w-0 overflow-hidden">
          <CardHeader>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <CardTitle className="text-sm font-medium">Leads recibidos</CardTitle>
                <CardDescription className="text-sm">Últimos {periodLabel} por estado · prom {metrics.avgLeadsPerMonth}/mes</CardDescription>
              </div>
              <span className="text-2xl font-semibold tabular-nums tracking-tight">{totalLeads12m}</span>
            </div>
          </CardHeader>
          <CardContent>
            <LeadsByMonthChart data={leadsByMonthData} average={metrics.avgLeadsPerMonth} />
          </CardContent>
        </Card>

        <Card className="border-border/60 min-w-0 overflow-hidden">
          <CardHeader>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <CardTitle className="text-sm font-medium">Cotizaciones enviadas</CardTitle>
                <CardDescription className="text-sm">Últimos {periodLabel} · prom {metrics.avgQuotesPerMonth}/mes</CardDescription>
              </div>
              <span className="text-2xl font-semibold tabular-nums tracking-tight">{totalQuotes24m}</span>
            </div>
          </CardHeader>
          <CardContent>
            <QuotesByMonthChart data={quotesByMonthData} average={metrics.avgQuotesPerMonth} />
          </CardContent>
        </Card>
      </div>

      {/* ─── Fuente + Embudo ─── */}
      <div className="grid gap-4 lg:grid-cols-2 min-w-0">
        <Card className="border-border/60 min-w-0 overflow-hidden">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Origen de leads</CardTitle>
            <CardDescription className="text-sm">Distribución últimos 12 meses</CardDescription>
          </CardHeader>
          <CardContent>
            <LeadsBySourceChart data={leadsBySourceData} />
          </CardContent>
        </Card>

        <Card className="border-border/60 min-w-0 overflow-hidden">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Embudo comercial</CardTitle>
            <CardDescription className="text-sm">Conversión últimos 30 días</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {funnel.map((step, i) => {
                const maxVal = Math.max(1, ...funnel.map((f) => f.value));
                const widthPct = step.value > 0 ? Math.max(12, (step.value / maxVal) * 100) : 4;
                return (
                  <div key={step.label}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{step.label}</span>
                      {step.rate !== null && <span className="text-xs text-muted-foreground/60 tabular-nums">{step.rate}% conv.</span>}
                    </div>
                    <div className="h-8 w-full overflow-hidden rounded-md bg-muted/30">
                      <div
                        className="flex h-full items-center rounded-md px-2.5 transition-all"
                        style={{
                          width: `${widthPct}%`,
                          background: i === 0 ? 'rgba(29,185,144,0.2)' : i === 1 ? 'rgba(29,185,144,0.35)' : i === 2 ? 'rgba(29,185,144,0.5)' : 'rgba(29,185,144,0.7)',
                        }}
                      >
                        <span className="text-sm font-semibold tabular-nums text-foreground">{step.value}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div className="mt-4 flex items-center justify-between rounded-lg border border-border/40 px-3 py-2">
                <span className="text-sm text-muted-foreground">Tasa lead a negocio</span>
                <span className="text-sm font-semibold text-primary tabular-nums">{leadToDealRate30}%</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
