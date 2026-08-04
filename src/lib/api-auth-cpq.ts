/**
 * API Auth CPQ — Helpers de permisos granulares para endpoints CPQ
 */

import { resolveApiPerms, type AuthContext } from "./api-auth";
import { canView, canEdit, canDelete } from "./permissions";
import { NextResponse } from "next/server";

export async function requireCpqView(ctx: AuthContext): Promise<NextResponse | null> {
  const perms = await resolveApiPerms(ctx);
  if (!canView(perms, "cpq")) {
    return NextResponse.json(
      { error: "Sin permisos para ver CPQ" },
      { status: 403 }
    );
  }
  return null;
}

export async function requireCpqEdit(ctx: AuthContext): Promise<NextResponse | null> {
  const perms = await resolveApiPerms(ctx);
  if (!canEdit(perms, "cpq")) {
    return NextResponse.json(
      { error: "Sin permisos para editar CPQ" },
      { status: 403 }
    );
  }
  return null;
}

export async function requireCpqDelete(ctx: AuthContext): Promise<NextResponse | null> {
  const perms = await resolveApiPerms(ctx);
  if (!canDelete(perms, "cpq")) {
    return NextResponse.json(
      { error: "Sin permisos para eliminar en CPQ" },
      { status: 403 }
    );
  }
  return null;
}

/**
 * Permiso unificado para eliminar cotizaciones: acepta borrado full en CPQ o en
 * CRM → Cotizaciones (las cotizaciones viven a caballo de ambos módulos).
 */
export async function requireQuoteDelete(ctx: AuthContext): Promise<NextResponse | null> {
  const perms = await resolveApiPerms(ctx);
  if (!canDelete(perms, "cpq") && !canDelete(perms, "crm", "quotes")) {
    return NextResponse.json(
      { error: "Sin permisos para eliminar cotizaciones" },
      { status: 403 }
    );
  }
  return null;
}
