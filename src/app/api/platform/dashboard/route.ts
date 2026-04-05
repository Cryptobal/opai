import { NextResponse } from 'next/server';
import { requirePlatformAuth, platformUnauthorized } from '@/lib/platform-api-auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const ctx = await requirePlatformAuth();
  if (!ctx) return platformUnauthorized();

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  // Fetch all tenants with their plans and modules
  const tenants = await prisma.tenant.findMany({
    include: {
      plan: true,
      modules: { where: { enabled: true } },
      admins: {
        select: { id: true, lastLoginAt: true },
        where: { status: 'active' },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Count guards per tenant
  const guardCounts = await prisma.opsGuardia.groupBy({
    by: ['tenantId'],
    where: { status: 'active' },
    _count: { id: true },
  });
  const guardMap = new Map(guardCounts.map((g) => [g.tenantId, g._count.id]));

  // Guards last month for growth calc
  const guardsLastMonth = await prisma.opsGuardia.count({
    where: {
      status: 'active',
      hiredAt: { lt: startOfMonth },
    },
  });
  const totalGuardsNow = guardCounts.reduce((sum, g) => sum + g._count.id, 0);

  // KPIs
  const activeTenants = tenants.filter((t) => t.active);
  const newThisMonth = tenants.filter(
    (t) => t.active && t.createdAt >= startOfMonth,
  ).length;

  const guardsGrowthPct =
    guardsLastMonth > 0
      ? Math.round(((totalGuardsNow - guardsLastMonth) / guardsLastMonth) * 100)
      : 0;

  // MRR calculation
  let estimatedMrr = 0;
  for (const t of activeTenants) {
    if (t.plan && t.plan.billingStatus !== 'trial') {
      const guards = guardMap.get(t.id) || 0;
      estimatedMrr +=
        Number(t.plan.basePrice) + Number(t.plan.pricePerGuard) * guards;
    }
  }

  // Expiring trials
  const expiringTrials = tenants.filter(
    (t) =>
      t.plan?.billingStatus === 'trial' &&
      t.plan?.trialEndsAt &&
      t.plan.trialEndsAt <= sevenDaysFromNow &&
      t.plan.trialEndsAt > now,
  ).length;

  // Build tenant list
  const tenantList = tenants.map((t) => {
    const activeGuards = guardMap.get(t.id) || 0;
    const lastLogin = t.admins.reduce<Date | null>((latest, a) => {
      if (!a.lastLoginAt) return latest;
      if (!latest || a.lastLoginAt > latest) return a.lastLoginAt;
      return latest;
    }, null);

    let status: string;
    if (!t.active) {
      status = 'suspended';
    } else if (t.plan?.billingStatus === 'trial') {
      status = 'trial';
    } else {
      status = 'active';
    }

    return {
      id: t.id,
      name: t.name,
      slug: t.slug,
      plan: t.plan?.plan || 'trial',
      billingStatus: t.plan?.billingStatus || 'trial',
      status,
      activeGuards,
      adminCount: t.admins.length,
      lastLoginAt: lastLogin?.toISOString() || null,
      createdAt: t.createdAt.toISOString(),
      trialEndsAt: t.plan?.trialEndsAt?.toISOString() || null,
      enabledModules: t.modules.length,
      usagePct: 0,
    };
  });

  return NextResponse.json({
    kpis: {
      activeTenants: activeTenants.length,
      activeTenantsGrowth: newThisMonth,
      totalGuards: totalGuardsNow,
      totalGuardsGrowthPct: guardsGrowthPct,
      estimatedMrr: Math.round(estimatedMrr * 100) / 100,
      expiringTrials,
    },
    tenants: tenantList,
  });
}
