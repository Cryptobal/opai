/**
 * Consulta de tickets para la bandeja de Slack (Fase 7 · alcances Fase 11).
 *
 * La bandeja replica la taxonomía de alcance de la web (`/ops/tickets`):
 *   · mine       → asignados a mí
 *   · my_team    → a mí O a un equipo del que soy miembro (default; = web `my_team`)
 *   · unassigned → sin responsable, a nivel TENANT (requiere visión global)
 *   · all        → todos los del tenant (requiere visión global)
 * "Sin asignar" y "Todos" son tenant-wide: quien llama debe gatearlos con la
 * misma capability que la web (acceso al módulo ops). Paginado 10/página.
 */

import { prisma } from "@/lib/prisma";
import { getAssignedTeamsForUser } from "@/lib/tickets-team-membership";

export const TRAY_PAGE_SIZE = 10;
const ACTIVE = ["open", "in_progress", "waiting", "pending_approval"];

export type TrayScope = "mine" | "my_team" | "unassigned" | "all";

export interface TrayFilters {
  status?: string; // vacío = activos
  priority?: string;
  slaBreached?: boolean;
  approvals?: boolean; // solo pendientes de MI aprobación (Bloque 4)
  scope?: TrayScope; // default my_team
}

export interface TrayRow {
  id: string;
  code: string;
  title: string;
  status: string;
  priority: string;
  slaBreached: boolean;
  assignedTo: string | null;
  assignedTeam: string;
}

/**
 * Construye el `where` de Prisma para un alcance + filtros. Devuelve también los
 * equipos del usuario (los reutiliza el render para decidir el botón "Tomar").
 */
async function buildWhere(
  tenantId: string,
  userId: string,
  filters: TrayFilters,
): Promise<{ where: Record<string, unknown>; teams: string[] }> {
  const scope = filters.scope ?? "my_team";
  const teams = await getAssignedTeamsForUser(tenantId, userId);
  const where: Record<string, unknown> = { tenantId };
  const and: Array<Record<string, unknown>> = [];

  if (scope === "mine") {
    where.assignedTo = userId;
  } else if (scope === "unassigned") {
    where.assignedTo = null;
  } else if (scope === "all") {
    // Tenant-wide, sin filtro de asignación.
  } else {
    // my_team: a mí O a un equipo del que soy miembro; sin equipos degrada a "mine".
    if (teams.length > 0) and.push({ OR: [{ assignedTo: userId }, { assignedTeam: { in: teams } }] });
    else where.assignedTo = userId;
  }

  if (filters.approvals) {
    where.status = "pending_approval";
  } else if (filters.status) {
    where.status = filters.status;
  } else {
    where.status = { in: ACTIVE };
  }
  if (filters.priority) where.priority = filters.priority;
  if (filters.slaBreached) where.slaBreached = true;
  if (and.length > 0) where.AND = and;

  return { where, teams };
}

export async function listMyTickets(
  tenantId: string,
  userId: string,
  filters: TrayFilters,
  page: number,
): Promise<{ rows: TrayRow[]; total: number; page: number; hasMore: boolean; teams: string[] }> {
  const { where, teams } = await buildWhere(tenantId, userId, filters);

  const p = Math.max(1, page);
  const skip = (p - 1) * TRAY_PAGE_SIZE;
  const [items, total] = await Promise.all([
    prisma.opsTicket.findMany({
      where,
      orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
      skip,
      take: TRAY_PAGE_SIZE,
      select: {
        id: true, code: true, title: true, status: true, priority: true,
        slaBreached: true, assignedTo: true, assignedTeam: true,
      },
    }),
    prisma.opsTicket.count({ where }),
  ]);

  return { rows: items, total, page: p, hasMore: skip + items.length < total, teams };
}

/** Solo el conteo de un alcance/filtro (para el desglose "Tu día" del Home). */
export async function countTickets(
  tenantId: string,
  userId: string,
  filters: TrayFilters,
): Promise<number> {
  const { where } = await buildWhere(tenantId, userId, filters);
  return prisma.opsTicket.count({ where });
}
