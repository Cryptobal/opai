/**
 * API Auth Tareas — guard para /api/crm/tasks*.
 *
 * Las Tareas viven ahora bajo el módulo Productividad (/opai/tareas), pero
 * también se usan desde el checklist de un Negocio (CRM). Para no romper a
 * quien ya podía gestionar el checklist con `crm.deals`, el guard acepta
 * CUALQUIERA de los dos permisos: `productividad.tareas` o `crm.deals`.
 *
 * Conserva la capa de módulo-tenant "crm" (las tareas viven en el plan CRM) y
 * devuelve el mismo shape que `requireTenantModule` para ser drop-in.
 */

import { NextResponse } from "next/server";
import { resolveApiPerms, type AuthContext } from "./api-auth";
import { requireTenantModule } from "./require-module";
import { canView, canEdit } from "./permissions";

export type TasksAuthResult =
  | { authorized: true; ctx: AuthContext }
  | { authorized: false; response: NextResponse };

export async function requireTasksAccess(
  level: "view" | "edit" = "edit",
): Promise<TasksAuthResult> {
  const modCheck = await requireTenantModule("crm");
  if (!modCheck.authorized) return modCheck;

  const ctx = modCheck.ctx;
  const perms = await resolveApiPerms(ctx);
  const ok =
    level === "edit"
      ? canEdit(perms, "productividad", "tareas") || canEdit(perms, "crm", "deals")
      : canView(perms, "productividad", "tareas") || canView(perms, "crm", "deals");

  if (!ok) {
    return {
      authorized: false,
      response: NextResponse.json(
        { success: false, error: "Sin permisos para Tareas" },
        { status: 403 },
      ),
    };
  }

  return { authorized: true, ctx };
}
