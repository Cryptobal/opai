import { prisma } from "@/lib/prisma";
import { TICKET_TEAM_CONFIG, type TicketTeam } from "@/lib/tickets";
import { notify } from "./notify";

/**
 * Notifica a un admin que se le asignó un ticket como responsable.
 * No-op si assigneeId es null/empty o si el assignee es la misma persona que asignó.
 *
 * Se invoca desde:
 *   - POST /api/ops/tickets (creación con assignedTo)
 *   - PATCH /api/ops/tickets/[id] (cambio de assignedTo)
 *   - Auto-asignación desde hallazgos de supervisión
 */
export async function notifyTicketAssigned(params: {
  tenantId: string;
  ticketId: string;
  ticketCode: string;
  ticketTitle: string;
  ticketPriority: string;
  ticketAssignedTeam: string;
  assigneeId: string;
  assignedById: string;
  source?: "creation" | "patch" | "auto_finding";
}): Promise<void> {
  const {
    tenantId,
    ticketId,
    ticketCode,
    ticketTitle,
    ticketPriority,
    ticketAssignedTeam,
    assigneeId,
    assignedById,
    source = "patch",
  } = params;

  // No notificar a la misma persona que se auto-asigna (ej. tomar un ticket).
  if (!assigneeId || assigneeId === assignedById) return;

  let assignerName = "Un usuario";
  try {
    const assigner = await prisma.admin.findFirst({
      where: { id: assignedById, tenantId },
      select: { name: true, email: true },
    });
    assignerName = assigner?.name || assigner?.email || "Un usuario";
  } catch { /* noop */ }

  const teamLabel =
    TICKET_TEAM_CONFIG[ticketAssignedTeam as TicketTeam]?.label ?? ticketAssignedTeam;

  const sourceLabel =
    source === "creation"
      ? `${assignerName} te asignó como responsable al crear el ticket`
      : source === "auto_finding"
      ? "Asignación automática por hallazgo de supervisión"
      : `${assignerName} te asignó como responsable`;

  const bellMessage = `${sourceLabel} · Equipo: ${teamLabel} · Prioridad: ${ticketPriority.toUpperCase()}`;
  const emailBody = [
    sourceLabel,
    `Ticket: ${ticketCode} — ${ticketTitle}`,
    `Equipo: ${teamLabel}`,
    `Prioridad: ${ticketPriority.toUpperCase()}`,
  ].join("\n");

  try {
    await notify({
      tenantId,
      type: "ticket_assigned",
      targetIds: [assigneeId],
      targetType: "ADMIN",
      title: `Ticket asignado: ${ticketCode} — ${ticketTitle}`,
      body: bellMessage,
      emailBody,
      link: `/opai/ops/tickets/${ticketId}`,
      data: { ticketId, code: ticketCode, priority: ticketPriority, source },
    });
  } catch (err) {
    console.error("[OPS][NOTIFY] Error notifying ticket assignment:", err);
  }
}
