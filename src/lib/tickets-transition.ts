/**
 * Servicio de transición de estado de tickets (Fase 7). Extraído para que Slack
 * y la web compartan la misma validación de máquina de estados + auditoría.
 * El control de acceso lo hace quien llama. `cerrar` = resolved, `cancelar` = cancelled
 * (no hay endpoint separado; ambos van por transición).
 */

import { prisma } from "@/lib/prisma";
import { canTransitionTo, TICKET_STATUS_CONFIG, type TicketStatus } from "@/lib/tickets";
import { recordTicketEvent } from "@/lib/tickets-events";

export interface TransitionInput {
  tenantId: string;
  actorId: string;
  ticketId: string;
  targetStatus: TicketStatus;
  source?: string;
}

export type TransitionResult =
  | { ok: true; ticket: { id: string; code: string; title: string; status: string } }
  | { ok: false; error: string };

export async function transitionTicketStatus(input: TransitionInput): Promise<TransitionResult> {
  const ticket = await prisma.opsTicket.findFirst({
    where: { id: input.ticketId, tenantId: input.tenantId },
    select: { id: true, status: true, code: true, title: true, assignedTo: true, reportedBy: true },
  });
  if (!ticket) return { ok: false, error: "Ticket no encontrado" };

  const from = ticket.status as TicketStatus;
  if (from === input.targetStatus) return { ok: false, error: "El ticket ya está en ese estado" };
  if (!canTransitionTo(from, input.targetStatus)) {
    const toLabel = TICKET_STATUS_CONFIG[input.targetStatus]?.label ?? input.targetStatus;
    const fromLabel = TICKET_STATUS_CONFIG[from]?.label ?? from;
    return { ok: false, error: `No se puede pasar de «${fromLabel}» a «${toLabel}»` };
  }

  const now = new Date();
  const data: { status: string; resolvedAt?: Date } = { status: input.targetStatus };
  if (input.targetStatus === "resolved") data.resolvedAt = now;

  const updated = await prisma.opsTicket.update({
    where: { id: ticket.id },
    data,
    select: { id: true, code: true, title: true, status: true, assignedTo: true, reportedBy: true },
  });

  await recordTicketEvent({
    tenantId: input.tenantId,
    ticketId: ticket.id,
    type: "status_changed",
    actorId: input.actorId,
    data: { from, to: input.targetStatus, source: input.source ?? "slack" },
  });

  const targets = [...new Set([updated.assignedTo, updated.reportedBy].filter((x): x is string => !!x && x !== input.actorId))];
  if (targets.length > 0) {
    const label = TICKET_STATUS_CONFIG[input.targetStatus]?.label ?? input.targetStatus;
    const { notify } = await import("@/lib/notifications/notify");
    await notify({
      tenantId: input.tenantId,
      type: "ticket_mention",
      targetIds: targets,
      targetType: "ADMIN",
      title: `Ticket ${updated.code}: ${label}`,
      body: updated.title,
      link: `/ops/tickets/${updated.id}`,
      data: { ticketId: updated.id, code: updated.code, status: input.targetStatus, source: "slack" },
    }).catch((err) => console.error("[tickets] notify transición:", err));
  }

  return { ok: true, ticket: { id: updated.id, code: updated.code, title: updated.title, status: updated.status } };
}
