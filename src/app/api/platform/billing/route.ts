import { NextResponse } from 'next/server';
import { requirePlatformAuth, platformUnauthorized } from '@/lib/platform-api-auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const ctx = await requirePlatformAuth();
  if (!ctx) return platformUnauthorized();

  const tenants = await prisma.tenant.findMany({
    where: { active: true },
    include: {
      plan: true,
      tenantAddons: {
        where: { enabled: true },
        include: { addon: true },
      },
    },
    orderBy: { name: 'asc' },
  });

  const tenantIds = tenants.map((t) => t.id);
  const guardCounts = await prisma.opsGuardia.groupBy({
    by: ['tenantId'],
    where: { tenantId: { in: tenantIds }, status: 'active' },
    _count: { id: true },
  });
  const guardMap = new Map(guardCounts.map((g) => [g.tenantId, g._count.id]));

  // Load packs for discount calculation
  const packs = await prisma.packCatalog.findMany({ where: { active: true } });

  let mrr = 0;
  let totalGuards = 0;

  const billingTenants = tenants.map((t) => {
    const guards = guardMap.get(t.id) || 0;
    totalGuards += guards;

    // Plan price
    const pricePerGuard = Number(t.plan?.customPricePerGuard ?? t.plan?.pricePerGuard ?? 0);
    const baseMinimum = Number(t.plan?.customBaseMinimum ?? t.plan?.basePrice ?? 0);
    const planPrice = Math.max(pricePerGuard * guards, baseMinimum);

    // Add-on prices
    const addonDetails: { name: string; price: number }[] = [];
    let addonsTotal = 0;

    for (const ta of t.tenantAddons) {
      const effectivePrice = Number(ta.customPrice ?? ta.addon.priceAmount);
      let addonPrice = 0;

      switch (ta.addon.pricingModel) {
        case 'per_guard':
          addonPrice = effectivePrice * guards;
          break;
        case 'flat':
          addonPrice = effectivePrice;
          break;
        case 'per_unit':
          addonPrice = effectivePrice; // Default 1 unit
          break;
      }

      addonDetails.push({ name: ta.addon.name, price: Math.round(addonPrice * 100) / 100 });
      addonsTotal += addonPrice;
    }

    // Pack discounts
    let packDiscount = 0;
    const activeAddonSlugs = new Set(t.tenantAddons.map((ta) => ta.addon.slug));

    for (const pack of packs) {
      const allActive = pack.addonSlugs.every((s: string) => activeAddonSlugs.has(s));
      if (allActive && pack.addonSlugs.length > 0) {
        // Calculate discount on the sum of pack addon prices
        const packAddonTotal = t.tenantAddons
          .filter((ta) => pack.addonSlugs.includes(ta.addon.slug))
          .reduce((sum: number, ta) => {
            const ep = Number(ta.customPrice ?? ta.addon.priceAmount);
            const ap = ta.addon.pricingModel === 'per_guard' ? ep * guards :
                       ta.addon.pricingModel === 'flat' ? ep : ep;
            return sum + ap;
          }, 0);
        packDiscount += packAddonTotal * Number(pack.discountPct) / 100;
      }
    }

    const monthlyTotal = Math.round((planPrice + addonsTotal - packDiscount) * 100) / 100;

    if (t.plan?.billingStatus !== 'trial' && t.plan?.plan !== 'free') {
      mrr += monthlyTotal;
    }

    return {
      id: t.id,
      name: t.name,
      slug: t.slug,
      plan: t.plan?.plan || 'free',
      billingStatus: t.plan?.billingStatus || 'trial',
      activeGuards: guards,
      planPrice: Math.round(planPrice * 100) / 100,
      addons: addonDetails,
      addonsTotal: Math.round(addonsTotal * 100) / 100,
      packDiscount: Math.round(packDiscount * 100) / 100,
      monthlyTotal,
      currency: t.plan?.currency || 'UF',
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
