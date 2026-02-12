/**
 * CRM - Dashboard ejecutivo: reportes, métricas, visión comercial + operaciones
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { hasCrmSubmoduleAccess } from '@/lib/module-access';
import { hasAppAccess } from '@/lib/app-access';
import { getDefaultTenantId } from '@/lib/tenant';
import { prisma } from '@/lib/prisma';
import { PageHeader } from '@/components/opai';
import { KpiCard } from '@/components/opai/KpiCard';
import { CrmSubnav } from '@/components/crm/CrmSubnav';
import {
  LeadsByMonthChart,
  QuotesByMonthChart,
  LeadsBySourceChart,
  GuardsByStatusChart,
  type LeadByMonthRow,
  type QuotesByMonthRow,
  type LeadBySourceRow,
  type GuardsByStatusRow,
} from '@/components/crm/CrmDashboardCharts';
import { CRM_SUBMODULE_NAV_ITEMS } from '@/lib/module-access';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import {
  Users,
  UserPlus,
  Building2,
  MapPin,
  BriefcaseBusiness,
  Send,
  Target,
  CheckCircle2,
  Shield,
  ClipboardList,
  Clock3,
  AlertTriangle,
} from 'lucide-react';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function formatMonthLabel(dateStr: string): string {
  const d = new Date(dateStr);
  return `${MONTH_LABELS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
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
  const role = session.user.role;
  if (!hasCrmSubmoduleAccess(role, 'overview')) redirect('/hub');

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

  const canSeeOps = hasAppAccess(role, 'ops');

  // KPIs + funnel + chart data in parallel
  const [
    leadsThisMonth,
    leadsPending,
    accountsActive,
    installationsActive,
    guardsContratados,
    openDealsCount,
    openDealsAmount,
    // Funnel 30d
    leadsCreated30,
    leadsConverted30,
    proposalsSent30,
    wonDealsWithProposal30Rows,
    // Leads by month (raw)
    leadsByMonthRaw,
    // Quotes by month (raw)
    quotesByMonthRaw,
    // Leads by source
    leadsBySourceGroup,
    // Ops (conditional)
    guardsByLifecycle,
    puestosActive,
    tePending,
    ppcToday,
    pautaCountThisMonth,
    asistenciaCoveredThisMonth,
  ] = await Promise.all([
    prisma.crmLead.count({
      where: { tenantId, createdAt: { gte: startOfThisMonth } },
    }),
    prisma.crmLead.count({
      where: { tenantId, status: 'pending' },
    }),
    prisma.crmAccount.count({
      where: { tenantId, status: 'client_active' },
    }),
    prisma.crmInstallation.count({
      where: { tenantId, isActive: true },
    }),
    canSeeOps
      ? prisma.opsGuardia.count({
          where: { tenantId, lifecycleStatus: 'contratado_activo' },
        })
      : Promise.resolve(0),
    prisma.crmDeal.count({
      where: { tenantId, status: 'open' },
    }),
    prisma.crmDeal.aggregate({
      where: { tenantId, status: 'open' },
      _sum: { amount: true },
    }),
    prisma.crmLead.count({
      where: { tenantId, createdAt: { gte: thirtyDaysAgo } },
    }),
    prisma.crmLead.count({
      where: {
        tenantId,
        createdAt: { gte: thirtyDaysAgo },
        convertedDealId: { not: null },
      },
    }),
    prisma.crmDeal.count({
      where: {
        tenantId,
        proposalSentAt: { gte: thirtyDaysAgo },
      },
    }),
    prisma.crmDealStageHistory.findMany({
      where: {
        tenantId,
        changedAt: { gte: thirtyDaysAgo },
        toStage: { is: { isClosedWon: true } },
        deal: { is: { proposalSentAt: { not: null } } },
      },
      select: { dealId: true },
      distinct: ['dealId'],
    }),
    prisma.$queryRaw<
      Array<{ month: Date; status: string; count: bigint }>
    >`
      SELECT date_trunc('month', created_at)::date as month, status, COUNT(*)::bigint as count
      FROM crm.leads
      WHERE tenant_id = ${tenantId} AND created_at >= ${twelveMonthsAgo}
      GROUP BY 1, 2 ORDER BY 1
    `,
    prisma.$queryRaw<
      Array<{ month: Date; count: bigint }>
    >`
      SELECT date_trunc('month', proposal_sent_at)::date as month, COUNT(*)::bigint as count
      FROM crm.deals
      WHERE tenant_id = ${tenantId} AND proposal_sent_at >= ${twentyFourMonthsAgo}
      GROUP BY 1 ORDER BY 1
    `,
    prisma.crmLead.groupBy({
      by: ['source'],
      where: { tenantId, createdAt: { gte: twelveMonthsAgo } },
      _count: true,
    }),
    canSeeOps
      ? prisma.opsGuardia.groupBy({
          by: ['lifecycleStatus'],
          where: { tenantId },
          _count: true,
        })
      : Promise.resolve([]),
    canSeeOps
      ? prisma.opsPuestoOperativo.count({ where: { tenantId, active: true } })
      : Promise.resolve(0),
    canSeeOps
      ? prisma.opsTurnoExtra.count({ where: { tenantId, status: 'pending' } })
      : Promise.resolve(0),
    canSeeOps
      ? (() => {
          const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          const endOfToday = new Date(startOfToday);
          endOfToday.setDate(endOfToday.getDate() + 1);
          return prisma.opsPautaMensual.count({
            where: {
              tenantId,
              date: { gte: startOfToday, lt: endOfToday },
              puesto: { active: true },
              OR: [
                { plannedGuardiaId: null, shiftCode: null },
                { plannedGuardiaId: null, shiftCode: { notIn: ['-'] } },
                { shiftCode: { in: ['V', 'L', 'P'] } },
              ],
            },
          });
        })()
      : Promise.resolve(0),
    canSeeOps
      ? (() => {
          const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
          const endMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
          return prisma.opsPautaMensual.count({
            where: {
              tenantId,
              date: { gte: startMonth, lte: endMonth },
              puesto: { active: true },
              shiftCode: { not: '-' },
            },
          });
        })()
      : Promise.resolve(0),
    canSeeOps
      ? (() => {
          const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
          const endMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
          return prisma.opsAsistenciaDiaria.count({
            where: {
              tenantId,
              date: { gte: startMonth, lte: endMonth },
              attendanceStatus: { in: ['asistio', 'reemplazo'] },
            },
          });
        })()
      : Promise.resolve(0),
  ]);

  const wonDealsWithProposal30 = wonDealsWithProposal30Rows.length;
  const leadToDealRate30 = toPercent(leadsConverted30, leadsCreated30);
  const proposalToWonRate30 = toPercent(wonDealsWithProposal30, proposalsSent30);
  const openDealsAmountFormatted =
    openDealsAmount._sum.amount != null
      ? new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(
          Number(openDealsAmount._sum.amount)
        )
      : '—';

  const funnel = [
    { label: 'Leads nuevos', value: leadsCreated30, href: '/crm/leads', rateFromPrev: null as number | null },
    {
      label: 'Leads convertidos',
      value: leadsConverted30,
      href: '/crm/leads',
      rateFromPrev: toPercent(leadsConverted30, leadsCreated30),
    },
    {
      label: 'Propuestas enviadas',
      value: proposalsSent30,
      href: '/crm/deals',
      rateFromPrev: toPercent(proposalsSent30, leadsConverted30),
    },
    {
      label: 'Negocios ganados',
      value: wonDealsWithProposal30,
      href: '/crm/deals',
      rateFromPrev: toPercent(wonDealsWithProposal30, proposalsSent30),
    },
  ];

  const statusOrder = ['pending', 'in_review', 'approved', 'rejected'];
  const monthMap = new Map<string, { pending: number; in_review: number; approved: number; rejected: number }>();
  for (const row of leadsByMonthRaw) {
    const key = row.month instanceof Date ? row.month.toISOString().slice(0, 7) : String(row.month).slice(0, 7);
    const count = Number(row.count);
    if (!monthMap.has(key)) monthMap.set(key, { pending: 0, in_review: 0, approved: 0, rejected: 0 });
    const status = row.status ?? 'pending';
    const prev = monthMap.get(key)!;
    if (status === 'pending') prev.pending = count;
    else if (status === 'in_review') prev.in_review = count;
    else if (status === 'approved') prev.approved = count;
    else if (status === 'rejected') prev.rejected = count;
  }
  const leadsByMonthData: LeadByMonthRow[] = Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([monthKey, counts]) => {
      const total = counts.pending + counts.in_review + counts.approved + counts.rejected;
      const [y, m] = monthKey.split('-').map(Number);
      const monthLabel = `${MONTH_LABELS[(m ?? 1) - 1]} ${y}`;
      return {
        month: monthKey,
        monthLabel,
        pending: counts.pending,
        in_review: counts.in_review,
        approved: counts.approved,
        rejected: counts.rejected,
        total,
      };
    });

  const quotesByMonthData: QuotesByMonthRow[] = quotesByMonthRaw.map((row) => {
    const d = row.month instanceof Date ? row.month : new Date(row.month);
    const monthKey = d.toISOString().slice(0, 7);
    const monthLabel = formatMonthLabel(monthKey + '-01');
    return { month: monthKey, monthLabel, count: Number(row.count) };
  });

  const getSourceCount = (r: (typeof leadsBySourceGroup)[number]) =>
    typeof r._count === 'number' ? r._count : (r._count as Record<string, number>)['source'] ?? 0;
  const leadsBySourceData: LeadBySourceRow[] = leadsBySourceGroup.map((r) => ({
    source: r.source ?? 'otros',
    sourceLabel: formatLeadSource(r.source),
    count: getSourceCount(r),
    percent: 0,
  }));
  const totalLeadsSource = leadsBySourceData.reduce((s, r) => s + r.count, 0);
  leadsBySourceData.forEach((r) => {
    r.percent = toPercent(r.count, totalLeadsSource);
  });

  const getGuardCount = (g: (typeof guardsByLifecycle)[number]) =>
    typeof g._count === 'number' ? g._count : (g._count as Record<string, number>)['lifecycleStatus'] ?? 0;
  const guardLifecycleOrder = ['contratado_activo', 'postulante', 'seleccionado', 'inactivo', 'desvinculado'];
  const guardsByStatusData: GuardsByStatusRow[] = guardLifecycleOrder
    .map((status) => ({
      status,
      label:
        status === 'contratado_activo'
          ? 'Contratados'
          : status === 'postulante'
            ? 'Postulantes'
            : status === 'seleccionado'
              ? 'Seleccionados'
              : status === 'inactivo'
                ? 'Inactivos'
                : 'Desvinculados',
      count: getGuardCount(guardsByLifecycle.find((g) => g.lifecycleStatus === status) ?? { _count: 0, lifecycleStatus: '' }),
    }))
    .filter((r) => r.count > 0);

  const coveragePercent = pautaCountThisMonth > 0 ? toPercent(asistenciaCoveredThisMonth, pautaCountThisMonth) : 0;

  const visibleNavItems = CRM_SUBMODULE_NAV_ITEMS.filter((item) => hasCrmSubmoduleAccess(role, item.key));

  return (
    <div className="space-y-6">
      <PageHeader title="CRM" description="Pipeline comercial y gestión de clientes" />
      <CrmSubnav role={role} />

      {/* KPIs ejecutivos */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 2xl:grid-cols-6">
        <Link href="/crm/leads" className="min-w-0">
          <KpiCard
            title="Leads este mes"
            value={leadsThisMonth}
            icon={<UserPlus className="h-4 w-4" />}
            variant="sky"
            className="h-full transition-all hover:ring-2 hover:ring-primary/25"
          />
        </Link>
        <Link href="/crm/leads?status=pending" className="min-w-0">
          <KpiCard
            title="Leads pendientes"
            value={leadsPending}
            icon={<Users className="h-4 w-4" />}
            variant="amber"
            className="h-full transition-all hover:ring-2 hover:ring-primary/25"
          />
        </Link>
        <Link href="/crm/accounts" className="min-w-0">
          <KpiCard
            title="Cuentas activas"
            value={accountsActive}
            icon={<Building2 className="h-4 w-4" />}
            variant="emerald"
            className="h-full transition-all hover:ring-2 hover:ring-primary/25"
          />
        </Link>
        <Link href="/crm/installations" className="min-w-0">
          <KpiCard
            title="Instalaciones activas"
            value={installationsActive}
            icon={<MapPin className="h-4 w-4" />}
            variant="blue"
            className="h-full transition-all hover:ring-2 hover:ring-primary/25"
          />
        </Link>
        {canSeeOps && (
          <Link href="/personas/guardias" className="min-w-0">
            <KpiCard
              title="Guardias contratados"
              value={guardsContratados}
              icon={<Shield className="h-4 w-4" />}
              variant="purple"
              className="h-full transition-all hover:ring-2 hover:ring-primary/25"
            />
          </Link>
        )}
        <Link href="/crm/deals" className="min-w-0">
          <KpiCard
            title="Negocios abiertos"
            value={openDealsCount}
            description={openDealsAmountFormatted}
            icon={<BriefcaseBusiness className="h-4 w-4" />}
            variant="teal"
            className="h-full transition-all hover:ring-2 hover:ring-primary/25"
          />
        </Link>
      </div>

      {/* Gráficos históricos: Leads por mes | Cotizaciones por mes */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Leads recibidos por mes</CardTitle>
            <CardDescription>Últimos 12 meses por estado</CardDescription>
          </CardHeader>
          <CardContent>
            <LeadsByMonthChart data={leadsByMonthData} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cotizaciones enviadas por mes</CardTitle>
            <CardDescription>Últimos 24 meses</CardDescription>
          </CardHeader>
          <CardContent>
            <QuotesByMonthChart data={quotesByMonthData} />
          </CardContent>
        </Card>
      </div>

      {/* Leads por fuente | Embudo comercial */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Leads por fuente</CardTitle>
            <CardDescription>Últimos 12 meses</CardDescription>
          </CardHeader>
          <CardContent>
            <LeadsBySourceChart data={leadsBySourceData} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Embudo comercial (30 días)</CardTitle>
            <CardDescription>Conversión de leads a propuestas y cierre</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {funnel.map((step) => (
                <Link
                  key={step.label}
                  href={step.href}
                  className="rounded-lg border border-border bg-card p-3 transition-colors hover:bg-accent/40"
                >
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{step.label}</p>
                  <p className="mt-1 text-2xl font-semibold">{step.value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {step.rateFromPrev == null ? 'Base del periodo' : `${step.rateFromPrev}% desde etapa anterior`}
                  </p>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Snapshot operaciones */}
      {canSeeOps && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                Personal operativo
              </CardTitle>
              <CardDescription>Guardias por estado de vida</CardDescription>
            </CardHeader>
            <CardContent>
              <GuardsByStatusChart data={guardsByStatusData} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-muted-foreground" />
                Cobertura operacional
              </CardTitle>
              <CardDescription>Puestos, cobertura del mes y pendientes</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-lg border border-border bg-card p-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Puestos activos</p>
                  <p className="mt-1 text-xl font-semibold">{puestosActive}</p>
                </div>
                <div className="rounded-lg border border-border bg-card p-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Cobertura mes</p>
                  <p className="mt-1 text-xl font-semibold">{coveragePercent}%</p>
                </div>
                <Link href="/ops/turnos-extra" className="rounded-lg border border-border bg-card p-3 transition-colors hover:bg-accent/40">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    <Clock3 className="h-3 w-3" /> TE pendientes
                  </p>
                  <p className="mt-1 text-xl font-semibold">{tePending}</p>
                </Link>
                <Link href="/ops/ppc" className="rounded-lg border border-border bg-card p-3 transition-colors hover:bg-accent/40">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> PPC hoy
                  </p>
                  <p className="mt-1 text-xl font-semibold">{ppcToday}</p>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Accesos directos a módulos */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Accesos rápidos</CardTitle>
          <CardDescription>Ir a cada módulo del CRM</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {visibleNavItems.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent/40 hover:border-primary/30"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
