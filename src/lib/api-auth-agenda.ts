/**
 * API Auth Agenda — guard estándar para todas las rutas /api/agenda*.
 *
 * Aplica el mismo patrón de /api/crm/users: módulo tenant "crm" habilitado +
 * sesión válida + permiso de vista CRM. Además expone la regla de ownership
 * para mutaciones sobre visitas (PATCH/DELETE).
 */

import { NextResponse } from "next/server";
import { requireAuth, unauthorized, type AuthContext } from "./api-auth";
import { requireCrmView } from "./api-auth-crm";
import { requireTenantModule } from "./require-module";

export type AgendaAuthResult =
  | { ok: true; ctx: AuthContext }
  | { ok: false; response: NextResponse };

export async function requireAgendaAccess(): Promise<AgendaAuthResult> {
  const modCheck = await requireTenantModule("crm");
  if (!modCheck.authorized) return { ok: false, response: modCheck.response };

  const ctx = await requireAuth();
  if (!ctx) return { ok: false, response: unauthorized() };

  const forbidden = await requireCrmView(ctx);
  if (forbidden) return { ok: false, response: forbidden };

  return { ok: true, ctx };
}

const PRIVILEGED_ROLES = new Set(["owner", "admin"]);

/**
 * Mutar (reprogramar/completar/cancelar) una visita requiere ser su creador,
 * su responsable asignado, o tener rol owner/admin en el tenant.
 */
export function canMutateVisita(
  ctx: AuthContext,
  visita: { createdBy: string | null; assignedUserId: string | null },
): boolean {
  if (PRIVILEGED_ROLES.has(ctx.userRole)) return true;
  return ctx.userId === visita.createdBy || ctx.userId === visita.assignedUserId;
}

export function visitaForbidden(): NextResponse {
  return NextResponse.json(
    { error: "Sin permisos sobre esta visita" },
    { status: 403 },
  );
}
