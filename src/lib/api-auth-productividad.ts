/**
 * API Auth Productividad — guard para las rutas de Correos (/api/crm/correos*).
 *
 * Correos vive bajo /api/crm/correos por convención de rutas, pero su permiso
 * de usuario es `productividad.correos` (antes NO tenía ningún chequeo de
 * permiso de usuario, sólo el módulo-tenant "crm"). Este guard conserva la capa
 * de módulo-tenant "crm" (la casilla Gmail vive en el plan CRM) y añade el
 * chequeo de permiso de usuario productividad.correos.
 *
 * Es un drop-in de `requireTenantModule("crm")`: devuelve el mismo shape
 * `{ authorized: true; ctx } | { authorized: false; response }`, así que las
 * rutas sólo cambian la llamada del guard.
 */

import { NextResponse } from "next/server";
import { resolveApiPerms, type AuthContext } from "./api-auth";
import { requireTenantModule } from "./require-module";
import { canView, canEdit } from "./permissions";

export type CorreosAuthResult =
  | { authorized: true; ctx: AuthContext }
  | { authorized: false; response: NextResponse };

/**
 * Exige módulo-tenant "crm" habilitado + sesión válida + permiso de usuario
 * `productividad.correos` (nivel `view` por defecto, `edit` para escrituras).
 */
export async function requireCorreosAccess(
  level: "view" | "edit" = "view",
): Promise<CorreosAuthResult> {
  const modCheck = await requireTenantModule("crm");
  if (!modCheck.authorized) return modCheck;

  const ctx = modCheck.ctx;
  const perms = await resolveApiPerms(ctx);
  const ok =
    level === "edit"
      ? canEdit(perms, "productividad", "correos")
      : canView(perms, "productividad", "correos");

  if (!ok) {
    return {
      authorized: false,
      response: NextResponse.json(
        { success: false, error: "Sin permisos para Correos" },
        { status: 403 },
      ),
    };
  }

  return { authorized: true, ctx };
}
