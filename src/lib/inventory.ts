/**
 * Inventario - Helpers para módulo de inventario (Ops)
 */

import { NextResponse } from "next/server";
import type { AuthContext } from "@/lib/api-auth";
import { resolvePermissions } from "@/lib/permissions-server";
import { hasModuleAccess, canView } from "@/lib/permissions";

export function forbiddenInventario() {
  return NextResponse.json(
    { success: false, error: "Sin permisos para Inventario" },
    { status: 403 }
  );
}

export async function ensureInventarioAccess(ctx: AuthContext): Promise<NextResponse | null> {
  const perms = await resolvePermissions({
    role: ctx.userRole,
    roleTemplateId: ctx.roleTemplateId,
  });
  if (!hasModuleAccess(perms, "ops")) return forbiddenInventario();
  if (!canView(perms, "ops", "inventario")) return forbiddenInventario();
  return null;
}
