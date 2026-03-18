/**
 * API Auth CRM — Helpers de permisos granulares para endpoints CRM
 *
 * Usar después de requireAuth() en cada handler:
 *   const forbidden = await requireCrmView(ctx, "leads");
 *   if (forbidden) return forbidden;
 */

import { resolveApiPerms, type AuthContext } from "./api-auth";
import { canView, canEdit, canDelete } from "./permissions";
import { NextResponse } from "next/server";

export async function requireCrmView(
  ctx: AuthContext,
  sub?: string
): Promise<NextResponse | null> {
  const perms = await resolveApiPerms(ctx);
  if (!canView(perms, "crm", sub)) {
    return NextResponse.json(
      { error: "Sin permisos para ver CRM" },
      { status: 403 }
    );
  }
  return null;
}

export async function requireCrmEdit(
  ctx: AuthContext,
  sub?: string
): Promise<NextResponse | null> {
  const perms = await resolveApiPerms(ctx);
  if (!canEdit(perms, "crm", sub)) {
    return NextResponse.json(
      { error: "Sin permisos para editar CRM" },
      { status: 403 }
    );
  }
  return null;
}

export async function requireCrmDelete(
  ctx: AuthContext,
  sub?: string
): Promise<NextResponse | null> {
  const perms = await resolveApiPerms(ctx);
  if (!canDelete(perms, "crm", sub)) {
    return NextResponse.json(
      { error: "Sin permisos para eliminar en CRM" },
      { status: 403 }
    );
  }
  return null;
}
