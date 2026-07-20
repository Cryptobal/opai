import { NextRequest, NextResponse } from "next/server";
import { requireAuth, resolveApiPerms, unauthorized } from "@/lib/api-auth";
import { canEdit } from "@/lib/permissions";
import { isRadarComercialEnabled, setRadarComercialEnabled } from "@/lib/crm/radar-settings";

export const dynamic = "force-dynamic";

/** GET → estado del kill-switch del Radar Comercial + permiso de gestión. */
export async function GET() {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const enabled = await isRadarComercialEnabled(ctx.tenantId);
  const perms = await resolveApiPerms(ctx);
  return NextResponse.json({ enabled, canManage: canEdit(perms, "config", "asistente_ia") });
}

/** PUT { enabled } → activa/desactiva el radar para el tenant. */
export async function PUT(request: NextRequest) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (!canEdit(perms, "config", "asistente_ia")) {
    return NextResponse.json({ error: "Sin permisos para cambiar esta configuración" }, { status: 403 });
  }
  const body = (await request.json().catch(() => ({}))) as { enabled?: unknown };
  const enabled = body.enabled === true;
  await setRadarComercialEnabled(ctx.tenantId, enabled);
  return NextResponse.json({ enabled });
}
