/**
 * Consulta "Mis tickets" para la bandeja de Slack (Fase 7). "Mis tickets" =
 * asignados a mí O a un equipo del que soy miembro (mismo criterio que la web,
 * `assignedTo=my_team`). Paginado 10/página. Tenant-scoped.
 */

import { prisma } from "@/lib/prisma";
import { getAssignedTeamsForUser } from "@/lib/tickets-team-membership";

export const TRAY_PAGE_SIZE = 10;
const ACTIVE = ["open", "in_progress", "waiting", "pending_approval"];

export interface TrayFilters {
  status?: string; // vacío = activos
  priority?: string;
  slaBreached?: boolean;
  approvals?: boolean; // solo pendientes de MI aprobación (Bloque 4)
}

export interface TrayRow {
  id: string;
  code: string;
  title: string;
  status: string;
  priority: string;
  slaBreached: boolean;
}

export async function listMyTickets(
  tenantId: string,
  userId: string,
  filters: TrayFilters,
  page: number,
): Promise<{ rows: TrayRow[]; total: number; page: number; hasMore: boolean }> {
  const teams = await getAssignedTeamsForUser(tenantId, userId);
  const mine =
    teams.length > 0
      ? { OR: [{ assignedTo: userId }, { assignedTeam: { in: teams } }] }
      : { assignedTo: userId };

  const where: Record<string, unknown> = { tenantId, AND: [mine] };
  if (filters.approvals) {
    where.status = "pending_approval";
  } else if (filters.status) {
    where.status = filters.status;
  } else {
    where.status = { in: ACTIVE };
  }
  if (filters.priority) where.priority = filters.priority;
  if (filters.slaBreached) where.slaBreached = true;

  const p = Math.max(1, page);
  const skip = (p - 1) * TRAY_PAGE_SIZE;
  const [items, total] = await Promise.all([
    prisma.opsTicket.findMany({
      where,
      orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
      skip,
      take: TRAY_PAGE_SIZE,
      select: { id: true, code: true, title: true, status: true, priority: true, slaBreached: true },
    }),
    prisma.opsTicket.count({ where }),
  ]);

  return { rows: items, total, page: p, hasMore: skip + items.length < total };
}
