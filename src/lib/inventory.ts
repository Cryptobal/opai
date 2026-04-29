/**
 * Inventario - Helpers para módulo de inventario (Ops)
 */

import { NextResponse } from "next/server";
import type { AuthContext } from "@/lib/api-auth";
import { resolvePermissions } from "@/lib/permissions-server";
import { hasModuleAccess, canView, canEdit, canDelete } from "@/lib/permissions";

export function forbiddenInventario(message = "Sin permisos para Inventario") {
  return NextResponse.json(
    { success: false, error: message },
    { status: 403 }
  );
}

async function loadInventarioPerms(ctx: AuthContext) {
  return resolvePermissions({
    role: ctx.userRole,
    roleTemplateId: ctx.roleTemplateId,
  });
}

/** Lectura: visible para cualquier rol con `canView(ops.inventario)`. */
export async function ensureInventarioAccess(ctx: AuthContext): Promise<NextResponse | null> {
  const perms = await loadInventarioPerms(ctx);
  if (!hasModuleAccess(perms, "ops")) return forbiddenInventario();
  if (!canView(perms, "ops", "inventario")) return forbiddenInventario();
  return null;
}

/** Edición: crea/edita bodegas, productos, compras, entregas, transferencias. */
export async function ensureInventarioEdit(ctx: AuthContext): Promise<NextResponse | null> {
  const perms = await loadInventarioPerms(ctx);
  if (!hasModuleAccess(perms, "ops")) return forbiddenInventario();
  if (!canEdit(perms, "ops", "inventario")) {
    return forbiddenInventario("Sin permisos para editar Inventario");
  }
  return null;
}

/** Eliminación dura: bodegas, productos, compras (no aplica al revert de entregas propias). */
export async function ensureInventarioDelete(ctx: AuthContext): Promise<NextResponse | null> {
  const perms = await loadInventarioPerms(ctx);
  if (!hasModuleAccess(perms, "ops")) return forbiddenInventario();
  if (!canDelete(perms, "ops", "inventario")) {
    return forbiddenInventario("Sin permisos para eliminar en Inventario");
  }
  return null;
}

/**
 * Eliminación con auto-servicio: el creador del recurso puede eliminarlo
 * aunque no tenga `canDelete` global sobre inventario (caso supervisor revertiendo
 * su propia entrega). Caer al check de `canDelete` cuando el usuario no es el creador.
 */
export async function ensureInventarioDeleteOwn(
  ctx: AuthContext,
  createdBy: string | null | undefined,
): Promise<NextResponse | null> {
  if (createdBy && createdBy === ctx.userId) {
    // Aún se requiere que tenga al menos edición — por si el rol perdió acceso.
    return ensureInventarioEdit(ctx);
  }
  return ensureInventarioDelete(ctx);
}
