import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView, canEdit } from "@/lib/permissions";
import { aiService } from "@/lib/ai-service";
import {
  getAiBudgetStatus,
  setMonthlyTokenBudget,
  getMonthlyUsageByFeature,
} from "@/lib/crm/ai-budget";

export const dynamic = "force-dynamic";

/** GET — estado de agentes IA: presupuesto, consumo por feature, modelo activo. */
export async function GET() {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (!canView(perms, "config", "inteligencia_artificial")) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  const [budget, usage, active] = await Promise.all([
    getAiBudgetStatus(ctx.tenantId),
    getMonthlyUsageByFeature(ctx.tenantId),
    aiService.getActiveConfig({ tenantId: ctx.tenantId }),
  ]);

  return NextResponse.json({
    canManage: canEdit(perms, "config", "inteligencia_artificial"),
    budget,
    usage,
    model: active ? { providerType: active.providerType, modelId: active.modelId } : null,
  });
}

/** PUT — fija el presupuesto mensual de tokens de IA. */
export async function PUT(req: NextRequest) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (!canEdit(perms, "config", "inteligencia_artificial")) {
    return NextResponse.json({ error: "Sin permisos para gestionar agentes" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    budget?: number;
  };

  if (body.budget !== undefined) {
    if (typeof body.budget !== "number" || body.budget < 0) {
      return NextResponse.json({ error: "Presupuesto inválido" }, { status: 400 });
    }
    await setMonthlyTokenBudget(ctx.tenantId, body.budget);
  }

  return NextResponse.json({ ok: true });
}
