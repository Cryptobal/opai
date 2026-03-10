import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canEdit, canView, hasCapability } from "@/lib/permissions";
import { getFullAlertConfig, saveFullAlertConfig } from "@/lib/rondas/alert-config-service";
import { ALERT_CATALOG, CONFIGURABLE_ALERT_CODES } from "@/lib/rondas/alert-catalog";

export async function GET() {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "ops", "rondas")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const config = await getFullAlertConfig(ctx.tenantId);
    return NextResponse.json({ success: true, data: config, catalog: ALERT_CATALOG });
  } catch (error) {
    console.error("[ALERT_CONFIG] GET", error);
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

    // Start from current config, then apply submitted changes
    const config = await getFullAlertConfig(ctx.tenantId);

    for (const code of CONFIGURABLE_ALERT_CODES) {
      const submitted = body[code];
      if (!submitted) continue;

      const def = ALERT_CATALOG[code];

      if (typeof submitted.enabled === "boolean") {
        config[code].enabled = submitted.enabled;
      }
      if (submitted.severity && ["info", "warning", "critical"].includes(submitted.severity)) {
        config[code].severity = submitted.severity;
      }
      if (submitted.thresholds && def.thresholds) {
        for (const tDef of def.thresholds) {
          const val = submitted.thresholds[tDef.key];
          if (val !== undefined && typeof val === "number") {
            config[code].thresholds[tDef.key] = Math.max(tDef.min, Math.min(tDef.max, val));
          }
        }
      }
    }

    await saveFullAlertConfig(ctx.tenantId, config);
    return NextResponse.json({ success: true, data: config });
  } catch (error) {
    console.error("[ALERT_CONFIG] PUT", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
