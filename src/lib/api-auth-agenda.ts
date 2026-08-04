/**
 * API Auth Agenda — guard estándar para todas las rutas /api/agenda*.
 *
 * Aplica el mismo patrón de /api/crm/users: módulo tenant "crm" habilitado +
 * sesión válida + permiso de vista CRM. Además expone la regla de ownership
 * para mutaciones sobre visitas (PATCH/DELETE).
 */

import { NextResponse } from "next/server";
import { resolveApiPerms, type AuthContext } from "./api-auth";
import { requireTenantModule } from "./require-module";
import { canView } from "./permissions";

export type AgendaAuthResult =
  | { ok: true; ctx: AuthContext }
  | { ok: false; response: NextResponse };

/**
 * Guard de Agenda. Conserva la capa de módulo-tenant "crm" (la Agenda vive en
 * el plan CRM) pero el permiso de usuario ahora es `productividad.agenda`
 * (antes usaba `crm.deals` prestado, lo que dejaba fuera a roles operativos
 * como Central de Monitoreo que no tienen acceso a Comercial).
 */
export async function requireAgendaAccess(): Promise<AgendaAuthResult> {
  const modCheck = await requireTenantModule("crm");
  if (!modCheck.authorized) return { ok: false, response: modCheck.response };

  const ctx = modCheck.ctx;
  const perms = await resolveApiPerms(ctx);
  if (!canView(perms, "productividad", "agenda")) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Sin permisos para Agenda" },
        { status: 403 },
      ),
    };
  }

  return { ok: true, ctx };
}

const PRIVILEGED_ROLES = new Set(["owner", "admin"]);

/**
 * Mutar (reprogramar/completar/cancelar/editar) una visita requiere ser su
 * creador, su responsable asignado, participante organizer/owner, o rol
 * owner/admin en el tenant.
 */
export function canMutateVisita(
  ctx: AuthContext,
  visita: {
    createdBy: string | null;
    assignedUserId: string | null;
    /** Roles de CalendarEventParticipant del actor (si se consultaron). */
    participantRoles?: string[] | null;
  },
): boolean {
  if (PRIVILEGED_ROLES.has(ctx.userRole)) return true;
  if (ctx.userId === visita.createdBy || ctx.userId === visita.assignedUserId) {
    return true;
  }
  const roles = visita.participantRoles ?? [];
  return roles.some((r) => r === "organizer" || r === "owner");
}

/** Carga roles de participante del actor para extender canMutateVisita. */
export async function loadParticipantRolesForActor(
  tenantId: string,
  eventId: string,
  userId: string,
): Promise<string[]> {
  const { prisma } = await import("@/lib/prisma");
  const rows = await prisma.calendarEventParticipant.findMany({
    where: { tenantId, eventId, userId },
    select: { role: true },
  });
  return rows.map((r) => r.role);
}

export function visitaForbidden(): NextResponse {
  return NextResponse.json(
    { error: "Sin permisos sobre esta visita" },
    { status: 403 },
  );
}
