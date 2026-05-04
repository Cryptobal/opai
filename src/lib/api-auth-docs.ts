/**
 * API Auth Docs — Helpers de permisos granulares para endpoints Docs
 *
 * El módulo `docs` tiene 3 submódulos independientes:
 *   - "gestion"     → /opai/documentos          (gestión documental)
 *   - "operativos"  → /opai/documentos-operativos
 *   - "plantillas"  → /opai/documentos/templates
 *
 * Pasar el submódulo permite gatear cada API a su área. Si se omite, el
 * guard cae al nivel de módulo `docs` (compatibilidad con call-sites
 * antiguos que aún no migraron).
 */

import { resolveApiPerms, type AuthContext } from "./api-auth";
import { canView, canEdit, canDelete } from "./permissions";
import { NextResponse } from "next/server";

export type DocsSubmodule = "gestion" | "operativos" | "plantillas";

export async function requireDocsView(
  ctx: AuthContext,
  submodule?: DocsSubmodule,
): Promise<NextResponse | null> {
  const perms = await resolveApiPerms(ctx);
  if (!canView(perms, "docs", submodule)) {
    return NextResponse.json(
      { error: "Sin permisos para ver documentos" },
      { status: 403 }
    );
  }
  return null;
}

/**
 * Permite leer un recurso compartido entre submódulos de docs.
 * Útil para `/api/docs/templates` (los plantillas se usan tanto en gestión
 * para generar documentos como en el editor de plantillas) y para
 * `/api/docs/categories` (catálogo común).
 */
export async function requireDocsViewAny(
  ctx: AuthContext,
  submodules: readonly DocsSubmodule[],
): Promise<NextResponse | null> {
  const perms = await resolveApiPerms(ctx);
  const allowed = submodules.some((sub) => canView(perms, "docs", sub));
  if (!allowed) {
    return NextResponse.json(
      { error: "Sin permisos para ver documentos" },
      { status: 403 }
    );
  }
  return null;
}

export async function requireDocsEdit(
  ctx: AuthContext,
  submodule?: DocsSubmodule,
): Promise<NextResponse | null> {
  const perms = await resolveApiPerms(ctx);
  if (!canEdit(perms, "docs", submodule)) {
    return NextResponse.json(
      { error: "Sin permisos para editar documentos" },
      { status: 403 }
    );
  }
  return null;
}

export async function requireDocsDelete(
  ctx: AuthContext,
  submodule?: DocsSubmodule,
): Promise<NextResponse | null> {
  const perms = await resolveApiPerms(ctx);
  if (!canDelete(perms, "docs", submodule)) {
    return NextResponse.json(
      { error: "Sin permisos para eliminar documentos" },
      { status: 403 }
    );
  }
  return null;
}
