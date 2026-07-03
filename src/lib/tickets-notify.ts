/**
 * Notificaciones best-effort al crear un ticket (extraído de la ruta OPS para
 * que la web y Slack compartan exactamente el mismo comportamiento — Fase 5).
 *
 * El creador NO se auto-notifica; sólo se avisa al grupo/usuario del primer
 * paso de aprobación (cuando aplica) y al responsable si se asignó al crear.
 */

import { prisma } from "@/lib/prisma";
import { TICKET_TEAM_CONFIG } from "@/lib/tickets";

export interface TicketCreatedNotifyInput {
  tenantId: string;
  actorId: string;
  ticket: {
    id: string;
    code: string;
    title: string;
    description: string | null;
    priority: string;
    assignedTeam: string;
    assignedTo: string | null;
    source: string;
  };
  ticketType: { name: string; approvalSteps: Array<{ approverGroupId: string | null; approverUserId: string | null }> };
  requiresApproval: boolean;
}

export async function notifyTicketCreated(input: TicketCreatedNotifyInput): Promise<void> {
  const { tenantId, actorId, ticket, ticketType, requiresApproval } = input;
  try {
    const targetUserIds: string[] = [];
    const approvalTargetIds: string[] = [];

    const reporter = await prisma.admin.findFirst({
      where: { id: actorId, tenantId },
      select: { name: true, email: true },
    });
    const reporterName = reporter?.name || reporter?.email || "Usuario";

    if (requiresApproval && ticketType.approvalSteps.length > 0) {
      const firstStep = ticketType.approvalSteps[0];
      if (firstStep.approverGroupId) {
        const members = await prisma.adminGroupMembership.findMany({
          where: { groupId: firstStep.approverGroupId },
          select: { adminId: true },
        });
        for (const m of members) {
          targetUserIds.push(m.adminId);
          approvalTargetIds.push(m.adminId);
        }
      }
      if (firstStep.approverUserId) {
        targetUserIds.push(firstStep.approverUserId);
        approvalTargetIds.push(firstStep.approverUserId);
      }
    }

    const teamLabel = TICKET_TEAM_CONFIG[ticket.assignedTeam as keyof typeof TICKET_TEAM_CONFIG]?.label ?? ticket.assignedTeam;
    const bellMessage = `Tipo: ${ticketType.name} · Prioridad: ${ticket.priority.toUpperCase()}${requiresApproval ? " · Pendiente de aprobación" : ""}`;
    const emailLines = [
      `Tipo: ${ticketType.name} · Origen: ${ticket.source === "guard_portal" ? "Portal del guardia" : ticket.source === "manual" ? "Manual" : ticket.source}${requiresApproval ? " · Pendiente de aprobación" : ""}`,
      `Creado por: ${reporterName}`,
      `Equipo: ${teamLabel}`,
      `Prioridad: ${ticket.priority.toUpperCase()}`,
    ];
    if (ticket.description) {
      const desc = ticket.description.length > 200 ? ticket.description.slice(0, 200) + "…" : ticket.description;
      emailLines.push(`\nDescripción:\n${desc}`);
    }

    const { notify } = await import("@/lib/notifications/notify");
    const uniqueTargets = [...new Set(targetUserIds)];
    if (uniqueTargets.length > 0) {
      await notify({
        tenantId, type: "ticket_created", targetIds: uniqueTargets, targetType: "ADMIN",
        title: `Nuevo ticket: ${ticket.code} - ${ticket.title}`,
        body: bellMessage, emailBody: emailLines.join("\n"),
        link: `/ops/tickets/${ticket.id}`,
        data: { ticketId: ticket.id, code: ticket.code, priority: ticket.priority },
      });
    }
    if (requiresApproval && approvalTargetIds.length > 0) {
      await notify({
        tenantId, type: "ticket_needs_approval", targetIds: approvalTargetIds, targetType: "ADMIN",
        title: `Ticket ${ticket.code} pendiente de aprobación`,
        body: `"${ticket.title}" requiere tu aprobación`,
        link: `/ops/tickets/${ticket.id}`,
        data: { ticketId: ticket.id, code: ticket.code },
      });
    }
    if (ticket.assignedTo && ticket.assignedTo !== actorId) {
      const { notifyTicketAssigned } = await import("@/lib/notifications/notify-ticket-assigned");
      await notifyTicketAssigned({
        tenantId, ticketId: ticket.id, ticketCode: ticket.code, ticketTitle: ticket.title,
        ticketPriority: ticket.priority, ticketAssignedTeam: ticket.assignedTeam,
        assigneeId: ticket.assignedTo, assignedById: actorId, source: "creation",
      });
    }
  } catch (err) {
    console.error("[OPS] Error notifying ticket creation:", err);
  }
}
