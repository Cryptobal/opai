import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAuth, platformUnauthorized } from '@/lib/platform-api-auth';
import { prisma } from '@/lib/prisma';
import { PLAN_MODULES } from '@/lib/tenant-modules';
import { clearTenantModuleCache } from '@/lib/tenant-modules';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requirePlatformAuth();
  if (!ctx) return platformUnauthorized();

  const { id } = await params;
  const body = await request.json();

  const existingPlan = await prisma.tenantPlan.findUnique({
    where: { tenantId: id },
  });

  if (!existingPlan) {
    return NextResponse.json({ error: 'Plan no encontrado' }, { status: 404 });
  }

  const data: Record<string, unknown> = {};
  const fields = [
    'plan', 'maxGuards', 'maxAdmins', 'maxStorageMb',
    'basePrice', 'pricePerGuard', 'currency', 'billingStatus', 'trialEndsAt',
    'customPricePerGuard', 'customBaseMinimum',
  ];
  for (const field of fields) {
    if (field in body) data[field] = body[field];
  }

  // Normalize legacy plan names
  if (body.plan) {
    const nameMap: Record<string, string> = { trial: 'free', essential: 'starter', professional: 'profesional' };
    data.plan = nameMap[body.plan] || body.plan;
  }

  // If plan changed, auto-update modules and limits from catalog
  if (data.plan && data.plan !== existingPlan.plan) {
    const catalogPlan = await prisma.planCatalog.findUnique({
      where: { slug: data.plan as string },
    });

    const newModules = (catalogPlan?.includedModules as string[]) ??
      PLAN_MODULES[data.plan as string] ?? [];

    // Disable all existing plan modules
    await prisma.tenantModule.updateMany({
      where: { tenantId: id },
      data: { enabled: false },
    });

    // Enable plan modules
    for (const mod of newModules) {
      await prisma.tenantModule.upsert({
        where: { tenantId_module: { tenantId: id, module: mod } },
        update: { enabled: true },
        create: { tenantId: id, module: mod, enabled: true },
      });
    }

    // Re-enable any active add-on modules (don't disable add-ons on plan change)
    const activeAddons = await prisma.tenantAddon.findMany({
      where: { tenantId: id, enabled: true },
      include: { addon: true },
    });
    for (const ta of activeAddons) {
      if (ta.addon.moduleKey) {
        await prisma.tenantModule.upsert({
          where: { tenantId_module: { tenantId: id, module: ta.addon.moduleKey } },
          update: { enabled: true },
          create: { tenantId: id, module: ta.addon.moduleKey, enabled: true },
        });
      }
    }

    // Update limits from catalog
    if (catalogPlan) {
      data.maxGuards = catalogPlan.maxGuards;
      data.maxAdmins = catalogPlan.maxAdmins;
      data.maxStorageMb = catalogPlan.maxStorageMb;
      data.pricePerGuard = catalogPlan.pricePerGuard;
      data.basePrice = catalogPlan.baseMinimum;
      // Clear custom prices on plan change
      data.customPricePerGuard = null;
      data.customBaseMinimum = null;
    }

    // Log the plan change
    await prisma.planChangeLog.create({
      data: {
        tenantId: id,
        previousPlan: existingPlan.plan,
        newPlan: data.plan as string,
        previousPrice: existingPlan.pricePerGuard,
        newPrice: catalogPlan?.pricePerGuard ?? 0,
        changedBy: `platform:${ctx.email}`,
        addonsSnapshot: activeAddons.map((a) => ({
          slug: a.addon.slug,
          name: a.addon.name,
          price: Number(a.customPrice ?? a.addon.priceAmount),
        })),
      },
    });

    clearTenantModuleCache(id);
  }

  const updated = await prisma.tenantPlan.update({
    where: { tenantId: id },
    data,
  });

  return NextResponse.json({
    success: true,
    plan: {
      plan: updated.plan, maxGuards: updated.maxGuards,
      maxAdmins: updated.maxAdmins, maxStorageMb: updated.maxStorageMb,
      basePrice: Number(updated.basePrice), pricePerGuard: Number(updated.pricePerGuard),
      customPricePerGuard: updated.customPricePerGuard ? Number(updated.customPricePerGuard) : null,
      customBaseMinimum: updated.customBaseMinimum ? Number(updated.customBaseMinimum) : null,
      currency: updated.currency, billingStatus: updated.billingStatus,
      trialEndsAt: updated.trialEndsAt?.toISOString() || null,
    },
  });
}
