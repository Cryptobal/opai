import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requirePlatformAuth } from "@/lib/platform-api-auth";
import { prisma } from "@/lib/prisma";
import {
  clearTenantModuleCache,
  getCatalogIncludedModules,
} from "@/lib/tenant-modules";
import { logPlatformAction, platformActor } from "@/lib/platform/audit";
import { addonsAbsorbedByPlan } from "@/lib/platform/catalog-validate";

type AddonPatch = { slug: string; enabled: boolean; customPrice?: number | null };

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePlatformAuth({ minRole: "admin" });
  if (!auth.ok) return auth.response;
  const ctx = auth.ctx;

  const { id } = await params;
  let body: {
    plan?: string;
    pricingMode?: "catalog" | "negotiated";
    customPricePerGuard?: number | null;
    customBaseMinimum?: number | null;
    reason?: string;
    addons?: AddonPatch[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id },
    include: {
      plan: true,
      tenantAddons: { include: { addon: true } },
    },
  });
  if (!tenant) {
    return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
  }

  const nextPlan = body.plan ?? tenant.plan?.plan;
  if (!nextPlan) {
    return NextResponse.json({ error: "Debes asignar un plan" }, { status: 400 });
  }

  const catalog = await prisma.planCatalog.findUnique({ where: { slug: nextPlan } });
  if (!catalog) {
    return NextResponse.json(
      { error: `El plan "${nextPlan}" no existe en el catálogo` },
      { status: 400 },
    );
  }

  const isEnterprise = nextPlan.toLowerCase() === "enterprise";
  const pricingMode = isEnterprise ? "negotiated" : (body.pricingMode ?? "catalog");
  if (pricingMode === "negotiated" && !String(body.reason ?? "").trim()) {
    return NextResponse.json({ error: "El precio negociado exige un motivo" }, { status: 400 });
  }
  if (isEnterprise && body.customBaseMinimum == null && tenant.plan?.customBaseMinimum == null) {
    return NextResponse.json(
      { error: "Enterprise exige un mínimo negociado (customBaseMinimum)" },
      { status: 400 },
    );
  }

  const planModules = await getCatalogIncludedModules(catalog.slug);
  if (!planModules.length) {
    return NextResponse.json(
      { error: `El plan "${nextPlan}" no tiene módulos en el catálogo` },
      { status: 400 },
    );
  }

  const allAddons = await prisma.addonCatalog.findMany();
  const bySlug = new Map(allAddons.map((a) => [a.slug, a]));
  const addonPatches = body.addons ?? [];
  for (const patch of addonPatches) {
    if (!bySlug.has(patch.slug)) {
      return NextResponse.json({ error: `Add-on desconocido: ${patch.slug}` }, { status: 400 });
    }
  }

  const absorbed = addonsAbsorbedByPlan(
    allAddons.map((a) => ({ slug: a.slug, moduleKey: a.moduleKey })),
    planModules,
  );
  const absorbedSet = new Set(absorbed);

  const before = {
    plan: tenant.plan?.plan ?? null,
    customPricePerGuard: tenant.plan?.customPricePerGuard
      ? Number(tenant.plan.customPricePerGuard)
      : null,
    customBaseMinimum: tenant.plan?.customBaseMinimum
      ? Number(tenant.plan.customBaseMinimum)
      : null,
    addons: tenant.tenantAddons.filter((ta) => ta.enabled).map((ta) => ta.addon.slug),
  };

  await prisma.$transaction(
    async (tx) => {
      const planData: Prisma.TenantPlanUncheckedUpdateInput = {};
      const planChanged = tenant.plan?.plan !== nextPlan;

      if (planChanged) {
        planData.plan = catalog.slug;
        planData.maxGuards = catalog.maxGuards;
        planData.maxAdmins = catalog.maxAdmins;
        planData.maxStorageMb = catalog.maxStorageMb;
        planData.pricePerGuard = catalog.pricePerGuard;
        planData.basePrice = catalog.baseMinimum;
      }

      if (pricingMode === "catalog") {
        planData.customPricePerGuard = null;
        planData.customBaseMinimum = null;
        planData.pricePerGuard = catalog.pricePerGuard;
        planData.basePrice = catalog.baseMinimum;
      } else {
        if (body.customPricePerGuard !== undefined) {
          planData.customPricePerGuard =
            body.customPricePerGuard == null
              ? null
              : new Prisma.Decimal(body.customPricePerGuard);
        }
        if (body.customBaseMinimum !== undefined) {
          planData.customBaseMinimum =
            body.customBaseMinimum == null
              ? null
              : new Prisma.Decimal(body.customBaseMinimum);
        }
      }

      if (tenant.plan) {
        await tx.tenantPlan.update({ where: { tenantId: id }, data: planData });
      } else {
        await tx.tenantPlan.create({
          data: {
            tenantId: id,
            plan: catalog.slug,
            maxGuards: catalog.maxGuards,
            maxAdmins: catalog.maxAdmins,
            maxStorageMb: catalog.maxStorageMb,
            pricePerGuard: catalog.pricePerGuard,
            basePrice: catalog.baseMinimum,
            customPricePerGuard:
              pricingMode === "negotiated" && body.customPricePerGuard != null
                ? new Prisma.Decimal(body.customPricePerGuard)
                : null,
            customBaseMinimum:
              pricingMode === "negotiated" && body.customBaseMinimum != null
                ? new Prisma.Decimal(body.customBaseMinimum)
                : null,
            billingStatus: "trialing",
          },
        });
      }

      if (planChanged) {
        await tx.tenantModule.updateMany({
          where: { tenantId: id },
          data: { enabled: false },
        });
        for (const mod of planModules) {
          await tx.tenantModule.upsert({
            where: { tenantId_module: { tenantId: id, module: mod } },
            update: { enabled: true },
            create: { tenantId: id, module: mod, enabled: true },
          });
        }
        await tx.planChangeLog.create({
          data: {
            tenantId: id,
            previousPlan: tenant.plan?.plan ?? "none",
            newPlan: catalog.slug,
            previousPrice: tenant.plan?.pricePerGuard ?? 0,
            newPrice: catalog.pricePerGuard,
            changedBy: `platform:${ctx.email}`,
            reason: body.reason ?? null,
          },
        });
      }

      for (const patch of addonPatches) {
        const addon = bySlug.get(patch.slug);
        if (!addon) continue;
        const enabled = patch.enabled && !absorbedSet.has(addon.slug);
        await tx.tenantAddon.upsert({
          where: { tenantId_addonId: { tenantId: id, addonId: addon.id } },
          update: {
            enabled,
            customPrice:
              patch.customPrice === undefined
                ? undefined
                : patch.customPrice == null
                  ? null
                  : new Prisma.Decimal(patch.customPrice),
            deactivatedAt: enabled ? null : new Date(),
          },
          create: {
            tenantId: id,
            addonId: addon.id,
            enabled,
            customPrice:
              patch.customPrice == null ? null : new Prisma.Decimal(patch.customPrice),
          },
        });
        if (addon.moduleKey && !planModules.includes(addon.moduleKey as never)) {
          await tx.tenantModule.upsert({
            where: { tenantId_module: { tenantId: id, module: addon.moduleKey } },
            update: { enabled },
            create: { tenantId: id, module: addon.moduleKey, enabled },
          });
        }
      }

      if (absorbedSet.size) {
        const absorbedAddons = allAddons.filter((a) => absorbedSet.has(a.slug));
        for (const addon of absorbedAddons) {
          await tx.tenantAddon.updateMany({
            where: { tenantId: id, addonId: addon.id, enabled: true },
            data: { enabled: false, deactivatedAt: new Date() },
          });
        }
      }

      const remaining = await tx.tenantAddon.findMany({
        where: { tenantId: id, enabled: true },
        include: { addon: true },
      });
      for (const ta of remaining) {
        if (ta.addon.moduleKey) {
          await tx.tenantModule.upsert({
            where: { tenantId_module: { tenantId: id, module: ta.addon.moduleKey } },
            update: { enabled: true },
            create: { tenantId: id, module: ta.addon.moduleKey, enabled: true },
          });
        }
      }
    },
    { timeout: 30000 },
  );

  clearTenantModuleCache(id);

  await logPlatformAction({
    ...platformActor(ctx),
    action: "commercial.update",
    tenantId: id,
    targetType: "TenantPlan",
    targetId: id,
    before,
    after: {
      plan: nextPlan,
      pricingMode,
      customPricePerGuard: body.customPricePerGuard ?? null,
      customBaseMinimum: body.customBaseMinimum ?? null,
      reason: body.reason ?? null,
      absorbedAddons: absorbed,
    },
    request,
  });

  return NextResponse.json({ success: true, absorbedAddons: absorbed });
}
