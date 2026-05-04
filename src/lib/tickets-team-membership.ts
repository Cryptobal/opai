/**
 * Resuelve los valores de `OpsTicket.assignedTeam` que corresponden a los
 * grupos de admins (AdminGroup) donde el usuario está como miembro.
 *
 * Se usa para implementar el filtro "Asignados a mi equipo" sin necesidad de
 * agregar un campo nuevo en la tabla de tickets: aprovechamos el `slug` del
 * `AdminGroup` y el mapeo `TICKET_TEAM_TO_GROUP_SLUG` para encontrar los
 * teams asociados.
 *
 *   AdminGroupMembership.adminId = userId
 *     → AdminGroup.slug ∈ { "operaciones", "rrhh", ... }
 *       → assignedTeam ∈ { match directo (slug==team)
 *                          OR  TICKET_TEAM_TO_GROUP_SLUG.team == slug }
 */

import { prisma } from "@/lib/prisma";
import { TICKET_TEAM_TO_GROUP_SLUG } from "@/lib/tickets";

/**
 * Devuelve el conjunto de valores de `assignedTeam` que se consideran "mi
 * equipo" para un usuario dado. Vacío si el usuario no está en ningún grupo.
 */
export async function getAssignedTeamsForUser(
  tenantId: string,
  userId: string,
): Promise<string[]> {
  const memberships = await prisma.adminGroupMembership.findMany({
    where: {
      adminId: userId,
      group: { tenantId, isActive: true },
    },
    select: { group: { select: { slug: true } } },
  });
  const userSlugs = new Set(memberships.map((m) => m.group.slug));
  if (userSlugs.size === 0) return [];

  const teams = new Set<string>();
  // 1. Match directo: cualquier `assignedTeam` que coincida exactamente con
  //    un slug del usuario (cubre tenants donde los grupos se nombran con
  //    los mismos valores que `assignedTeam`).
  for (const slug of userSlugs) teams.add(slug);
  // 2. Match vía mapeo canónico (postventa→operaciones, ops→operaciones, …).
  for (const [team, groupSlug] of Object.entries(TICKET_TEAM_TO_GROUP_SLUG)) {
    if (userSlugs.has(groupSlug)) teams.add(team);
  }
  return Array.from(teams);
}
