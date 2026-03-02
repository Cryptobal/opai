import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canEdit, canView, hasCapability } from "@/lib/permissions";
import { getAlertConfig, saveAlertConfig, type AlertConfig } from "@/lib/rondas/ia-config";

export async function GET() {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "ops", "rondas")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const config = await getAlertConfig(ctx.tenantId);
    return NextResponse.json({ success: true, data: config });
  } catch (error) {
    console.error("[IA] config GET", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canEdit(perms, "ops", "rondas") || !hasCapability(perms, "rondas_configure")) {
      return NextResponse.json({ success: false, error: "Sin permisos de edición" }, { status: 403 });
    }

    const body = await request.json();

    const config: AlertConfig = {
      staticGuardMinutes: Math.max(2, Math.min(30, Number(body.staticGuardMinutes) || 5)),
      staticGuardEnabled: body.staticGuardEnabled !== false,
      speedAnomalyKmh: Math.max(5, Math.min(50, Number(body.speedAnomalyKmh) || 15)),
      speedAnomalyEnabled: body.speedAnomalyEnabled !== false,
      roundNotStartedMinutes: Math.max(5, Math.min(60, Number(body.roundNotStartedMinutes) || 10)),
      roundNotStartedEnabled: body.roundNotStartedEnabled !== false,
      checkpointSkippedEnabled: body.checkpointSkippedEnabled !== false,
      routeDeviationMultiplier: Math.max(1.5, Math.min(5, Number(body.routeDeviationMultiplier) || 2)),
      routeDeviationEnabled: body.routeDeviationEnabled !== false,
    };

    await saveAlertConfig(ctx.tenantId, config);
    return NextResponse.json({ success: true, data: config });
  } catch (error) {
    console.error("[IA] config PUT", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
