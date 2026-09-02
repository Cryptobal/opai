import { NextResponse } from 'next/server';
import { requirePlatformAuth, platformUnauthorized } from '@/lib/platform-api-auth';
import { prisma } from '@/lib/prisma';
import {
  computeTenantMonthly,
  serializeTenantMonthly,
} from '@/lib/platform/pricing';
import {
  deriveTenantAccess,
  uiCompatStatus,
} from '@/lib/platform/tenant-lifecycle';
import { getLifecycleSettings } from '@/lib/platform/settings';
import { getUfValue } from '@/lib/uf';

export async function GET() {
  const ctx = await requirePlatformAuth();
  if (!ctx) return platformUnauthorized();

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const settings = await getLifecycleSettings();

  const [tenants, packs, ufValue, openUpgradeRequests] = await Promise.all([
    prisma.tenant.findMany({
      include: {
        plan: true,
        modules: { where: { enabled: true } },
        admins: {
          select: { id: true, lastLoginAt: true },
          where: { status: 'active' },
        },
        tenantAddons: {
          where: { enabled: true },
          include: { addon: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.packCatalog.findMany(),
    getUfValue().catch(() => null),
    prisma.upgradeRequest.count({ where: { status: 'open' } }),
  ]);

  const guardCounts = await prisma.opsGuardia.groupBy({
    by: ['tenantId'],
    where: { status: 'active' },
    _count: { id: true },
  });
  const guardMap = new Map(guardCounts.map((g) => [g.tenantId, g._count.id]));

  const guardsLastMonth = await prisma.opsGuardia.count({
    where: {
      status: 'active',
      hiredAt: { lt: startOfMonth },
    },
  });
  const totalGuardsNow = guardCounts.reduce((sum, g) => sum + g._count.id, 0);

  const activeTenants = tenants.filter((t) => t.active);
  const newThisMonth = tenants.filter(
    (t) => t.active && t.createdAt >= startOfMonth,
  ).length;

  const guardsGrowthPct =
    guardsLastMonth > 0
      ? Math.round(((totalGuardsNow - guardsLastMonth) / guardsLastMonth) * 100)
      : 0;

  let estimatedMrr = 0;
  let payingTenants = 0;
  let trialingTenants = 0;
  let graceTenants = 0;
  let expiringTrials = 0;

  const tenantList = tenants.map((t) => {
    const activeGuards = guardMap.get(t.id) || 0;
    const lastLogin = t.admins.reduce<Date | null>((latest, a) => {
      if (!a.lastLoginAt) return latest;
      if (!latest || a.lastLoginAt > latest) return a.lastLoginAt;
      return latest;
    }, null);

    const access = deriveTenantAccess(
      {
        tenantId: t.id,
        slug: t.slug,
        active: t.active,
        suspendedAt: t.suspendedAt,
        plan: t.plan
          ? {
              billingStatus: t.plan.billingStatus,
              trialEndsAt: t.plan.trialEndsAt,
              graceEndsAt: t.plan.graceEndsAt,
              statusChangedAt: t.plan.statusChangedAt,
            }
          : null,
      },
      now,
      settings,
    );

    const price = t.plan
      ? computeTenantMonthly(
          t.plan,
          t.tenantAddons.map((ta) => ({
            slug: ta.addon.slug,
            name: ta.addon.name,
            pricingModel: ta.addon.pricingModel,
            priceAmount: ta.addon.priceAmount,
            customPrice: ta.customPrice,
          })),
          packs,
          activeGuards,
        )
      : null;

    const serialized = price ? serializeTenantMonthly(price, ufValue) : null;
    if (serialized?.countsTowardMrr) {
      estimatedMrr += serialized.total;
      payingTenants += 1;
    }
    if (access.state === 'trialing') trialingTenants += 1;
    if (access.state === 'trial_expired' || access.state === 'past_due') graceTenants += 1;
    if (access.state === 'trialing' && access.daysLeft != null && access.daysLeft >= 0 && access.daysLeft <= 7) {
      expiringTrials += 1;
    }

    return {
      id: t.id,
      name: t.name,
      slug: t.slug,
      plan: t.plan?.plan || 'trial',
      billingStatus: t.plan?.billingStatus || 'trial',
      status: uiCompatStatus(access),
      lifecycleState: access.state,
      accessMode: access.mode,
      daysLeft: access.daysLeft ?? null,
      pricingComplete: serialized?.complete ?? true,
      monthlyTotal: serialized?.total ?? 0,
      currency: serialized?.currency ?? t.plan?.currency ?? 'UF',
      activeGuards,
      adminCount: t.admins.length,
      lastLoginAt: lastLogin?.toISOString() || null,
      createdAt: t.createdAt.toISOString(),
      trialEndsAt: t.plan?.trialEndsAt?.toISOString() || null,
      graceEndsAt: t.plan?.graceEndsAt?.toISOString() || null,
      enabledModules: t.modules.length,
      usagePct: 0,
    };
  });

  const mrrUf = Math.round(estimatedMrr * 100) / 100;

  return NextResponse.json({
    kpis: {
      activeTenants: activeTenants.length,
      activeTenantsGrowth: newThisMonth,
      totalGuards: totalGuardsNow,
      totalGuardsGrowthPct: guardsGrowthPct,
      estimatedMrr: mrrUf,
      estimatedMrrUf: mrrUf,
      estimatedMrrClp: ufValue != null ? Math.round(mrrUf * ufValue) : null,
      currency: 'UF',
      expiringTrials,
      payingTenants,
      trialingTenants,
      graceTenants,
      openUpgradeRequests,
    },
    tenants: tenantList,
  });
}
