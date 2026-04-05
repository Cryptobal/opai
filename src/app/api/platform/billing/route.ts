import { NextResponse } from 'next/server';
import { requirePlatformAuth, platformUnauthorized } from '@/lib/platform-api-auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const ctx = await requirePlatformAuth();
  if (!ctx) return platformUnauthorized();

  const tenants = await prisma.tenant.findMany({
    where: { active: true },
    include: { plan: true },
    orderBy: { name: 'asc' },
  });

  const tenantIds = tenants.map((t) => t.id);
  const guardCounts = await prisma.opsGuardia.groupBy({
    by: ['tenantId'],
    where: { tenantId: { in: tenantIds }, status: 'active' },
    _count: { id: true },
  });
  const guardMap = new Map(guardCounts.map((g) => [g.tenantId, g._count.id]));

  let mrr = 0;
  let totalGuards = 0;

  const billingTenants = tenants.map((t) => {
    const guards = guardMap.get(t.id) || 0;
    const basePrice = Number(t.plan?.basePrice || 0);
    const pricePerGuard = Number(t.plan?.pricePerGuard || 0);
    const monthlyTotal = basePrice + pricePerGuard * guards;

    if (t.plan?.billingStatus !== 'trial') {
      mrr += monthlyTotal;
    }
    totalGuards += guards;

    return {
      id: t.id, name: t.name, slug: t.slug,
      plan: t.plan?.plan || 'trial',
      billingStatus: t.plan?.billingStatus || 'trial',
      basePrice, pricePerGuard, activeGuards: guards,
      monthlyTotal: Math.round(monthlyTotal * 100) / 100,
      trialEndsAt: t.plan?.trialEndsAt?.toISOString() || null,
    };
  });

  return NextResponse.json({
    tenants: billingTenants,
    totals: {
      mrr: Math.round(mrr * 100) / 100,
      totalGuards,
      activeTenants: tenants.length,
    },
  });
}
