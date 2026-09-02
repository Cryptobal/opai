import { NextResponse } from 'next/server';
import { requirePlatformAuth, platformUnauthorized } from '@/lib/platform-api-auth';
import { prisma } from '@/lib/prisma';
import { computeTenantMonthly, serializeTenantMonthly } from '@/lib/platform/pricing';
import { getUfValue } from '@/lib/uf';

export async function GET() {
  const ctx = await requirePlatformAuth();
  if (!ctx) return platformUnauthorized();

  const [tenants, packs, ufValue] = await Promise.all([
    prisma.tenant.findMany({
      where: { active: true },
      include: {
        plan: true,
        tenantAddons: {
          where: { enabled: true },
          include: { addon: true },
        },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.packCatalog.findMany(),
    getUfValue().catch(() => null),
  ]);

  const tenantIds = tenants.map((t) => t.id);
  const guardCounts = tenantIds.length
    ? await prisma.opsGuardia.groupBy({
        by: ['tenantId'],
        where: { tenantId: { in: tenantIds }, status: 'active' },
        _count: { id: true },
      })
    : [];
  const guardMap = new Map(guardCounts.map((g) => [g.tenantId, g._count.id]));

  let mrr = 0;
  let totalGuards = 0;

  const billingTenants = tenants.map((t) => {
    const guards = guardMap.get(t.id) || 0;
    totalGuards += guards;

    const price = computeTenantMonthly(
      t.plan ?? {
        plan: 'free',
        pricePerGuard: 0,
        basePrice: 0,
        billingStatus: 'trial',
        currency: 'UF',
      },
      t.tenantAddons.map((ta) => ({
        slug: ta.addon.slug,
        name: ta.addon.name,
        pricingModel: ta.addon.pricingModel,
        priceAmount: ta.addon.priceAmount,
        customPrice: ta.customPrice,
      })),
      packs,
      guards,
    );
    const serialized = serializeTenantMonthly(price, ufValue);

    if (serialized.countsTowardMrr) {
      mrr += serialized.total;
    }

    return {
      id: t.id,
      name: t.name,
      slug: t.slug,
      plan: t.plan?.plan || 'free',
      billingStatus: t.plan?.billingStatus || 'trial',
      activeGuards: guards,
      planPrice: serialized.planPrice,
      addons: serialized.breakdown.addonLines.map((l) => ({ name: l.name, price: l.amount })),
      addonsTotal: serialized.addonsTotal,
      packDiscount: serialized.packDiscount,
      monthlyTotal: serialized.total,
      currency: serialized.currency,
      complete: serialized.complete,
      clpTotal: serialized.clpTotal,
    };
  });

  const mrrUf = Math.round(mrr * 100) / 100;

  return NextResponse.json({
    tenants: billingTenants,
    totals: {
      mrr: mrrUf,
      mrrUf,
      mrrClp: ufValue != null ? Math.round(mrrUf * ufValue) : null,
      currency: 'UF',
      totalGuards,
      activeTenants: tenants.length,
    },
  });
}
