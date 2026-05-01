import { prisma } from "@/lib/prisma";
import { TICKET_TEAM_TO_GROUP_SLUG, type TicketTeam } from "@/lib/tickets";

/**
 * Resuelve los IDs de admins activos pertenecientes al grupo asociado a un
 * `assignedTeam` de ticket. Si el grupo no existe o no tiene miembros activos,
 * retorna [].
 */
export async function resolveTeamAdminIds(
  tenantId: string,
  assignedTeam: string,
): Promise<string[]> {
  const groupSlug = TICKET_TEAM_TO_GROUP_SLUG[assignedTeam as TicketTeam];
  if (!groupSlug) return [];

  const group = await prisma.adminGroup.findUnique({
    where: { tenantId_slug: { tenantId, slug: groupSlug } },
    select: {
      id: true,
      memberships: {
        select: { admin: { select: { id: true, status: true } } },
      },
    },
  });
  if (!group) return [];

  return group.memberships
    .filter((m) => m.admin?.status === "active")
    .map((m) => m.admin.id);
}
