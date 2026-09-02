import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAuth } from '@/lib/platform-api-auth';
import { prisma } from '@/lib/prisma';
import { getCatalogIncludedModules } from '@/lib/tenant-modules';
import { clearTenantModuleCache } from '@/lib/tenant-modules';
import { isBillingStatus, normalizeBillingStatus } from '@/lib/platform/tenant-lifecycle';
import { logPlatformAction, platformActor } from '@/lib/platform/audit';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePlatformAuth({ minRole: 'admin' });
  if (!auth.ok) return auth.response;
  const ctx = auth.ctx;

  const { id } = await params;
  const body = await request.json();

  const existingPlan = await prisma.tenantPlan.findUnique({
    where: { tenantId: id },
  });

  if (!existingPlan) {
    return NextResponse.json({ error: 'Plan no encontrado' }, { status: 404 });
  }

  if (body.billingStatus != null) {
    const normalized = normalizeBillingStatus(String(body.billingStatus));
    if (!normalized || (!isBillingStatus(String(body.billingStatus)) && String(body.billingStatus) !== 'trial')) {
      return NextResponse.json(
        { error: 'billingStatus inválido', allowed: ['trialing', 'trial_expired', 'active', 'past_due', 'suspended', 'cancelled'] },
        { status: 400 },
      );
    }
    body.billingStatus = normalized;
  }

  for (const field of ['maxGuards', 'maxAdmins'] as const) {
    if (field in body && (typeof body[field] !== 'number' || body[field] < 1)) {
      return NextResponse.json({ error: `${field} debe ser ≥ 1` }, { status: 400 });
    }
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

    const newModules = catalogPlan
      ? await getCatalogIncludedModules(catalogPlan.slug)
      : [];

    if (newModules.length === 0) {
      return NextResponse.json(
        {
          error: `El plan "${data.plan}" no tiene módulos definidos en el catálogo. Créalo en Planes antes de asignarlo.`,
        },
        { status: 400 },
      );
    }

    // Update limits from catalog (en memoria; se persiste dentro de la tx)
    if (catalogPlan) {
      data.maxGuards = catalogPlan.maxGuards;
      data.maxAdmins = catalogPlan.maxAdmins;
      data.maxStorageMb = catalogPlan.maxStorageMb;
      data.pricePerGuard = catalogPlan.pricePerGuard;
      data.basePrice = catalogPlan.baseMinimum;
      data.customPricePerGuard = null;
      data.customBaseMinimum = null;
    }

    await prisma.$transaction(async (tx) => {
      // Disable all existing plan modules
      await tx.tenantModule.updateMany({
        where: { tenantId: id },
        data: { enabled: false },
      });

      // Enable plan modules
      for (const mod of newModules) {
        await tx.tenantModule.upsert({
          where: { tenantId_module: { tenantId: id, module: mod } },
          update: { enabled: true },
          create: { tenantId: id, module: mod, enabled: true },
        });
      }

      // Re-enable any active add-on modules (don't disable add-ons on plan change)
      const activeAddons = await tx.tenantAddon.findMany({
        where: { tenantId: id, enabled: true },
        include: { addon: true },
      });
      for (const ta of activeAddons) {
        if (ta.addon.moduleKey) {
          await tx.tenantModule.upsert({
            where: { tenantId_module: { tenantId: id, module: ta.addon.moduleKey } },
            update: { enabled: true },
            create: { tenantId: id, module: ta.addon.moduleKey, enabled: true },
          });
        }
      }

      // Log the plan change
      await tx.planChangeLog.create({
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

      await tx.tenantPlan.update({
        where: { tenantId: id },
        data,
      });
    }, { timeout: 30000 });

    clearTenantModuleCache(id);

    const updated = await prisma.tenantPlan.findUniqueOrThrow({
      where: { tenantId: id },
    });

    await logPlatformAction({
      ...platformActor(ctx),
      action: 'plan.change',
      tenantId: id,
      targetType: 'TenantPlan',
      targetId: updated.id,
      before: { plan: existingPlan.plan, billingStatus: existingPlan.billingStatus },
      after: { plan: updated.plan, billingStatus: updated.billingStatus },
      request,
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

  const updated = await prisma.tenantPlan.update({
    where: { tenantId: id },
    data,
  });

  const priceTouched = [
    'customPricePerGuard', 'customBaseMinimum', 'pricePerGuard', 'basePrice',
  ].some((f) => f in body);

  await logPlatformAction({
    ...platformActor(ctx),
    action: priceTouched ? 'plan.price_override' : 'plan.change',
    tenantId: id,
    targetType: 'TenantPlan',
    targetId: updated.id,
    before: {
      plan: existingPlan.plan,
      billingStatus: existingPlan.billingStatus,
      customBaseMinimum: existingPlan.customBaseMinimum
        ? Number(existingPlan.customBaseMinimum)
        : null,
    },
    after: data as Record<string, unknown>,
    request,
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
