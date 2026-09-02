import { NextResponse } from "next/server";
import type { AuthContext } from "@/lib/api-auth";
import { resolvePermissions } from "@/lib/permissions-server";
import { canEdit, canView, hasCapability, hasModuleAccess } from "@/lib/permissions";

export function forbiddenCamaras(message = "Sin permisos para Cámaras") {
  return NextResponse.json({ success: false, error: message }, { status: 403 });
}

async function loadPerms(ctx: AuthContext) {
  return resolvePermissions({
    role: ctx.userRole,
    roleTemplateId: ctx.roleTemplateId,
  });
}

export async function ensureCamarasView(ctx: AuthContext): Promise<NextResponse | null> {
  const perms = await loadPerms(ctx);
  if (!hasModuleAccess(perms, "ops")) return forbiddenCamaras();
  if (!canView(perms, "ops", "camaras")) return forbiddenCamaras();
  return null;
}

/** Alta/edición/credenciales: edit + capability camaras_configure. */
export async function ensureCamarasEdit(ctx: AuthContext): Promise<NextResponse | null> {
  const perms = await loadPerms(ctx);
  if (!hasModuleAccess(perms, "ops")) return forbiddenCamaras();
  if (!canEdit(perms, "ops", "camaras") || !hasCapability(perms, "camaras_configure")) {
    return forbiddenCamaras("Sin permisos para configurar cámaras");
  }
  return null;
}

export async function canConfigureCamaras(ctx: AuthContext): Promise<boolean> {
  return (await ensureCamarasEdit(ctx)) === null;
}

