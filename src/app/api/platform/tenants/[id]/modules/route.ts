import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAuth } from "@/lib/platform-api-auth";
import { prisma } from "@/lib/prisma";
import { clearTenantModuleCache, getCatalogIncludedModules } from "@/lib/tenant-modules";
import { isTenantModuleKey } from "@/lib/modules/registry";
import { buildTenantModuleRows } from "@/lib/platform/module-origin";
import { logPlatformAction, platformActor } from "@/lib/platform/audit";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePlatformAuth({ minRole: "support" });
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const tenant = await prisma.tenant.findUnique({
    where: { id },
    include: {
      plan: { select: { plan: true } },
      modules: true,
      tenantAddons: {
        where: { enabled: true },
        include: { addon: { select: { moduleKey: true } } },
      },
    },
  });
  if (!tenant) {
    return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
  }

  const planSlug = tenant.plan?.plan ?? null;
  const planModules = planSlug ? await getCatalogIncludedModules(planSlug) : [];
  const addonModuleKeys = tenant.tenantAddons
    .map((ta) => ta.addon.moduleKey)
    .filter((k): k is string => Boolean(k));
  const enabledKeys = tenant.modules.filter((m) => m.enabled).map((m) => m.module);

  const modules = buildTenantModuleRows({
    enabledKeys,
    planModules,
    addonModuleKeys,
  });
  const enabled = modules.filter((m) => m.enabled).length;

  return NextResponse.json({
    planSlug,
    modules,
    counts: {
      all: modules.length,
      enabled,
      disabled: modules.length - enabled,
    },
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requirePlatformAuth({ minRole: "admin" });
  if (!auth.ok) return auth.response;
  const ctx = auth.ctx;

  const { id } = await params;
  const body = await request.json();
  const { module, enabled } = body;

  if (!module || typeof enabled !== "boolean") {
    return NextResponse.json(
      { error: "Se requiere module (string) y enabled (boolean)" },
      { status: 400 },
    );
  }
  if (!isTenantModuleKey(module)) {
    return NextResponse.json({ error: `Módulo desconocido: ${module}` }, { status: 400 });
  }

  const tenant = await prisma.tenant.findUnique({ where: { id }, select: { id: true } });
  if (!tenant) {
    return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
  }

  const previous = await prisma.tenantModule.findUnique({
    where: { tenantId_module: { tenantId: id, module } },
  });

  await prisma.tenantModule.upsert({
    where: { tenantId_module: { tenantId: id, module } },
    update: { enabled },
    create: { tenantId: id, module, enabled },
  });

  clearTenantModuleCache(id);

  await logPlatformAction({
    ...platformActor(ctx),
    action: "modules.toggle",
    tenantId: id,
    targetType: "TenantModule",
    targetId: module,
    before: { enabled: previous?.enabled ?? false },
    after: { module, enabled },
    request,
  });

  return NextResponse.json({ success: true });
}
