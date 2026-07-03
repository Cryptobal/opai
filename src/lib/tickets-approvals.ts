/**
 * Servicio de decisión de aprobación de tickets (aprobar/rechazar un paso).
 *
 * Extraído del route POST /api/ops/tickets/[id]/approvals para poder reutilizarlo
 * desde otros transportes (Slack interactividad) sin reimplementar la máquina de
 * estados: valida estado, registra la decisión, avanza/cierra la cadena, ejecuta
 * la acción post-aprobación (p.ej. turno de refuerzo) y notifica.
 *
 * El control de acceso es responsabilidad del CALLER (route: ensureOpsAccess;
 * Slack: permisos del admin vinculado). Todo scoping va por `tenantId`.
 */

import { prisma } from "@/lib/prisma";

export interface DecideApprovalInput {
  tenantId: string;
  userId: string;
  ticketId: string;
  decision: "approved" | "rejected";
  comment?: string | null;
}

export interface DecideApprovalResult {
  ok: boolean;
  httpStatus: number;
  error?: string;
  /** Registro crudo de la aprobación actualizada (para mapear en el caller). */
  approval?: unknown;
  ticketCode?: string;
  ticketTitle?: string;
  /** Estado final del ticket tras la decisión. */
  finalStatus?: string;
  decision?: "approved" | "rejected";
}

export async function decideTicketApproval(input: DecideApprovalInput): Promise<DecideApprovalResult> {
  const { tenantId, userId, ticketId, decision } = input;
  const comment = input.comment ?? null;

  const ticket = await prisma.opsTicket.findFirst({
    where: { id: ticketId, tenantId },
  });
  if (!ticket) return { ok: false, httpStatus: 404, error: "Ticket no encontrado" };

  if (ticket.status !== "pending_approval" || ticket.currentApprovalStep == null) {
    return { ok: false, httpStatus: 422, error: "El ticket no está en estado de aprobación pendiente" };
  }

  const currentApproval = await prisma.opsTicketApproval.findFirst({
    where: { ticketId, stepOrder: ticket.currentApprovalStep, decision: "pending" },
  });
  if (!currentApproval) {
    return { ok: false, httpStatus: 422, error: "No se encontró el paso de aprobación pendiente" };
  }

  const now = new Date();

  const updatedApproval = await prisma.opsTicketApproval.update({
    where: { id: currentApproval.id },
    data: { decision, decidedById: userId, comment, decidedAt: now },
  });

  // Audit trail: decisión de aprobación.
  try {
    const { recordTicketEvent } = await import("@/lib/tickets-events");
    await recordTicketEvent({
      tenantId,
      ticketId,
      type: "approval_decision",
      actorId: userId,
      data: {
        stepOrder: currentApproval.stepOrder,
        stepLabel: currentApproval.stepLabel,
        decision,
        comment,
      },
    });
  } catch {
    // best-effort
  }

  const ticketType = ticket.ticketTypeId
    ? await prisma.opsTicketType.findUnique({
        where: { id: ticket.ticketTypeId },
        select: { onApprovalAction: true },
      })
    : null;

  let finalStatus = "pending_approval";

  if (decision === "rejected") {
    await prisma.opsTicket.update({
      where: { id: ticketId },
      data: { status: "rejected", approvalStatus: "rejected" },
    });
    finalStatus = "rejected";
    if (ticketType?.onApprovalAction === "create_turno_extra") {
      try {
        const { executeRefuerzoRejection } = await import("@/lib/ops-refuerzos");
        await executeRefuerzoRejection({ tenantId, userId }, ticketId);
      } catch (e) {
        console.error("[OPS] Error executing refuerzo rejection:", e);
      }
    }
  } else {
    const nextStep = await prisma.opsTicketApproval.findFirst({
      where: { ticketId, stepOrder: { gt: ticket.currentApprovalStep }, decision: "pending" },
      orderBy: { stepOrder: "asc" },
    });

    if (nextStep) {
      await prisma.opsTicket.update({
        where: { id: ticketId },
        data: { currentApprovalStep: nextStep.stepOrder },
      });
      finalStatus = "pending_approval";
    } else {
      await prisma.opsTicket.update({
        where: { id: ticketId },
        data: { status: "open", approvalStatus: "approved", currentApprovalStep: null },
      });
      finalStatus = "open";
      if (ticketType?.onApprovalAction === "create_turno_extra") {
        try {
          const { executeRefuerzoApproval } = await import("@/lib/ops-refuerzos");
          await executeRefuerzoApproval({ tenantId, userId }, ticketId);
        } catch (e) {
          console.error("[OPS] Error executing refuerzo approval:", e);
        }
      }
    }
  }

  // ── Notificaciones dirigidas: solicitante + aprobadores relevantes ──
  try {
    const deciderRow = await prisma.admin.findUnique({ where: { id: userId }, select: { name: true } });
    const decider = deciderRow?.name ?? "Un usuario";

    const targetUserIds: string[] = [];
    if (ticket.reportedBy) targetUserIds.push(ticket.reportedBy);

    if (decision === "approved") {
      const nextPendingApproval = await prisma.opsTicketApproval.findFirst({
        where: { ticketId, decision: "pending" },
        orderBy: { stepOrder: "asc" },
      });
      if (nextPendingApproval?.approverGroupId) {
        const groupMembers = await prisma.adminGroupMembership.findMany({
          where: { groupId: nextPendingApproval.approverGroupId },
          select: { adminId: true },
        });
        for (const m of groupMembers) targetUserIds.push(m.adminId);
      }
    }

    const notifTitle = decision === "approved"
      ? `Ticket ${ticket.code} aprobado (paso ${ticket.currentApprovalStep})`
      : `Ticket ${ticket.code} rechazado`;
    const notifMessage = decision === "approved"
      ? `${decider} aprobó el paso "${currentApproval.stepLabel}"`
      : `${decider} rechazó el ticket: ${comment ?? "sin comentario"}`;

    const { notify } = await import("@/lib/notifications/notify");
    await notify({
      tenantId,
      type: decision === "approved" ? "ticket_approved" : "ticket_rejected",
      targetIds: targetUserIds,
      targetType: "ADMIN",
      title: notifTitle,
      body: notifMessage,
      link: `/ops/tickets/${ticketId}`,
      data: { ticketId, code: ticket.code, decision, step: currentApproval.stepLabel },
    });

    if (ticket.guardiaId) {
      await notify({
        tenantId,
        type: "ticket_updated",
        targetIds: [ticket.guardiaId],
        targetType: "GUARD",
        audience: "guardia",
        title: decision === "approved" ? `Solicitud ${ticket.code} aprobada` : `Solicitud ${ticket.code} rechazada`,
        body: decision === "approved"
          ? `${decider} aprobó tu solicitud "${ticket.title}"`
          : `${decider} rechazó tu solicitud: ${comment ?? "sin comentario"}`,
        data: { ticketId, code: ticket.code },
      });
    }
  } catch (err) {
    console.error("[OPS] Error notifying ticket approval:", err);
  }

  return {
    ok: true,
    httpStatus: 201,
    approval: updatedApproval,
    ticketCode: ticket.code,
    ticketTitle: ticket.title,
    finalStatus,
    decision,
  };
}
