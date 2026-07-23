import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { AI_MODULES } from "@/lib/ai/ai-feature-modules";
import {
  getTenantAiRouting,
  setTenantAiRouting,
  sanitizeRouting,
  type TenantAiRouting,
} from "@/lib/ai/tenant-ai-routing";

/** GET: módulos + proveedores configurados del tenant + ruteo actual. */
export async function GET() {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  const providersRaw = await prisma.tenantAiProvider.findMany({
    where: { tenantId: ctx.tenantId },
    include: { models: { where: { isActive: true }, orderBy: { costTier: "asc" } } },
    orderBy: { createdAt: "asc" },
  });

  const providers = providersRaw.map((p) => ({
    providerType: p.providerType,
    name: p.name,
    isActive: p.isActive,
    hasApiKey: !!p.apiKey,
    models: p.models.map((m) => ({
      modelId: m.modelId,
      displayName: m.displayName,
      costTier: m.costTier,
      isDefault: m.isDefault,
    })),
  }));

  // Proveedor por defecto del tenant (base cuando un módulo no tiene override).
  const activeProvider = providers.find((p) => p.isActive && p.hasApiKey);
  const defaultModel = activeProvider?.models.find((m) => m.isDefault) ?? activeProvider?.models[0];
  const defaultProvider = activeProvider
    ? {
        providerType: activeProvider.providerType,
        name: activeProvider.name,
        modelId: defaultModel?.modelId ?? "",
        displayName: defaultModel?.displayName ?? "",
      }
    : null;

  const routing = await getTenantAiRouting(ctx.tenantId);

  return NextResponse.json({
    success: true,
    data: { modules: AI_MODULES, providers, routing, defaultProvider },
  });
}

/** PUT: guarda el ruteo por módulo (solo entradas hacia proveedores+modelos que
 *  el tenant realmente tiene configurados con apiKey). */
export async function PUT(request: NextRequest) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "JSON inválido" }, { status: 400 });
  }

  const raw = (body as { routing?: unknown })?.routing ?? body;
  const proposed = sanitizeRouting(raw);

  // Validar contra proveedores/modelos reales del tenant.
  const providers = await prisma.tenantAiProvider.findMany({
    where: { tenantId: ctx.tenantId, apiKey: { not: null } },
    include: { models: { where: { isActive: true } } },
  });
  const valid = new Set<string>();
  for (const p of providers) {
    for (const m of p.models) valid.add(`${p.providerType}:${m.modelId}`);
  }

  const clean: TenantAiRouting = {};
  for (const [mod, route] of Object.entries(proposed)) {
    if (route && valid.has(`${route.providerType}:${route.modelId}`)) {
      clean[mod as keyof TenantAiRouting] = route;
    }
  }

  const saved = await setTenantAiRouting(ctx.tenantId, clean);
  return NextResponse.json({ success: true, data: { routing: saved } });
}
