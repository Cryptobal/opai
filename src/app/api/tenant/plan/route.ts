import { NextResponse } from 'next/server';
import { requireAuth, unauthorized } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  const { tenantId } = ctx;

  const [plan, modules, addons, planCatalog] = await Promise.all([
    prisma.tenantPlan.findUnique({ where: { tenantId } }),
    prisma.tenantModule.findMany({ where: { tenantId, enabled: true }, select: { module: true } }),
    prisma.tenantAddon.findMany({
      where: { tenantId, enabled: true },
      include: { addon: true },
    }),
    prisma.planCatalog.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } }),
  ]);

  return NextResponse.json({
    plan: plan ? {
      plan: plan.plan,
      maxGuards: plan.maxGuards,
      maxAdmins: plan.maxAdmins,
      maxStorageMb: plan.maxStorageMb,
      basePrice: Number(plan.basePrice),
      pricePerGuard: Number(plan.pricePerGuard),
      customPricePerGuard: plan.customPricePerGuard ? Number(plan.customPricePerGuard) : null,
      customBaseMinimum: plan.customBaseMinimum ? Number(plan.customBaseMinimum) : null,
      currency: plan.currency,
      billingStatus: plan.billingStatus,
      trialEndsAt: plan.trialEndsAt?.toISOString() ?? null,
    } : null,
    modules: modules.map((m) => m.module),
    addons: addons.map((ta) => ({
      slug: ta.addon.slug,
      name: ta.addon.name,
      price: Number(ta.customPrice ?? ta.addon.priceAmount),
      priceUnit: ta.addon.priceUnit,
    })),
    planCatalog: planCatalog.map((p) => ({
      slug: p.slug,
      name: p.name,
      headline: p.headline,
      description: p.description,
      pricePerGuard: Number(p.pricePerGuard),
      baseMinimum: Number(p.baseMinimum),
      maxGuards: p.maxGuards,
      maxAdmins: p.maxAdmins,
      includedModules: p.includedModules,
      featured: p.featured,
    })),
  });
}
