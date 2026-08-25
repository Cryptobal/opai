import { NextResponse } from "next/server";
import { resolveApiPerms, type AuthContext } from "@/lib/api-auth";
import { canView, canEdit, canDelete } from "@/lib/permissions";

export async function requireLaboralesView(
  ctx: AuthContext,
): Promise<NextResponse | null> {
  const perms = await resolveApiPerms(ctx);
  if (!canView(perms, "docs", "laborales")) {
    return NextResponse.json(
      { success: false, error: "Sin permisos para ver documentos laborales" },
      { status: 403 },
    );
  }
  return null;
}

export async function requireLaboralesEdit(
  ctx: AuthContext,
): Promise<NextResponse | null> {
  const perms = await resolveApiPerms(ctx);
  if (!canEdit(perms, "docs", "laborales")) {
    return NextResponse.json(
      { success: false, error: "Sin permisos para editar documentos laborales" },
      { status: 403 },
    );
  }
  return null;
}

export async function requireLaboralesDelete(
  ctx: AuthContext,
): Promise<NextResponse | null> {
  const perms = await resolveApiPerms(ctx);
  if (!canDelete(perms, "docs", "laborales")) {
    return NextResponse.json(
      { success: false, error: "Sin permisos para eliminar documentos laborales" },
      { status: 403 },
    );
  }
  return null;
}
