/**
 * API Auth Docs — Helpers de permisos granulares para endpoints Docs
 */

import { resolveApiPerms, type AuthContext } from "./api-auth";
import { canView, canEdit, canDelete } from "./permissions";
import { NextResponse } from "next/server";

export async function requireDocsView(ctx: AuthContext): Promise<NextResponse | null> {
  const perms = await resolveApiPerms(ctx);
  if (!canView(perms, "docs")) {
    return NextResponse.json(
      { error: "Sin permisos para ver documentos" },
      { status: 403 }
    );
  }
  return null;
}

export async function requireDocsEdit(ctx: AuthContext): Promise<NextResponse | null> {
  const perms = await resolveApiPerms(ctx);
  if (!canEdit(perms, "docs")) {
    return NextResponse.json(
      { error: "Sin permisos para editar documentos" },
      { status: 403 }
    );
  }
  return null;
}

export async function requireDocsDelete(ctx: AuthContext): Promise<NextResponse | null> {
  const perms = await resolveApiPerms(ctx);
  if (!canDelete(perms, "docs")) {
    return NextResponse.json(
      { error: "Sin permisos para eliminar documentos" },
      { status: 403 }
    );
  }
  return null;
}
