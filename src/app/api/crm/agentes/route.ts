import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView, canEdit } from "@/lib/permissions";
import { aiService } from "@/lib/ai-service";
import {
  getRadarVerticalSettings,
  setRadarVerticalEnabled,
  CONFIGURABLE_VERTICALS,
  type ConfigurableVertical,
} from "@/lib/crm/radar-settings";
import {
  getAiBudgetStatus,
  setMonthlyTokenBudget,
  getMonthlyUsageByFeature,
} from "@/lib/crm/ai-budget";

export const dynamic = "force-dynamic";

/** GET — estado de los agentes: toggles por vertical, presupuesto, consumo, modelo. */
export async function GET() {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (!canView(perms, "productividad", "agentes")) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  const [verticals, budget, usage, active] = await Promise.all([
    getRadarVerticalSettings(ctx.tenantId),
    getAiBudgetStatus(ctx.tenantId),
    getMonthlyUsageByFeature(ctx.tenantId),
    aiService.getActiveConfig({ tenantId: ctx.tenantId }),
  ]);

  return NextResponse.json({
    canManage: canEdit(perms, "productividad", "agentes"),
    verticals,
    budget,
    usage,
    model: active ? { providerType: active.providerType, modelId: active.modelId } : null,
  });
}

/** PUT — activa/desactiva una vertical o fija el presupuesto mensual. */
export async function PUT(req: NextRequest) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (!canEdit(perms, "productividad", "agentes")) {
    return NextResponse.json({ error: "Sin permisos para gestionar agentes" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    vertical?: string;
    enabled?: boolean;
    budget?: number;
  };

  if (body.vertical !== undefined) {
    if (!CONFIGURABLE_VERTICALS.includes(body.vertical as ConfigurableVertical)) {
      return NextResponse.json({ error: "Vertical inválida" }, { status: 400 });
    }
    await setRadarVerticalEnabled(ctx.tenantId, body.vertical as ConfigurableVertical, body.enabled === true);
  }

  if (body.budget !== undefined) {
    if (typeof body.budget !== "number" || body.budget < 0) {
      return NextResponse.json({ error: "Presupuesto inválido" }, { status: 400 });
    }
    await setMonthlyTokenBudget(ctx.tenantId, body.budget);
  }

  return NextResponse.json({ ok: true });
}
