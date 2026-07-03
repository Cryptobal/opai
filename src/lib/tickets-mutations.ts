/**
 * Servicios de mutación de tickets reutilizables (Fase 7): prioridad, reasignación
 * y comentario. Extraídos para que Slack y la web compartan la lógica + auditoría.
 * El control de acceso lo hace quien llama (Slack: capability del admin vinculado).
 */

import { prisma } from "@/lib/prisma";
import { recordTicketEvent } from "@/lib/tickets-events";
import { isTerminalStatus } from "@/lib/tickets";

type Ok<T> = { ok: true } & T;
type Err = { ok: false; error: string };

async function loadTicket(tenantId: string, ticketId: string) {
  return prisma.opsTicket.findFirst({
    where: { id: ticketId, tenantId },
    select: { id: true, code: true, title: true, status: true, priority: true, assignedTo: true, assignedTeam: true },
  });
}

export async function changeTicketPriority(input: {
  tenantId: string;
  actorId: string;
  ticketId: string;
  priority: string;
}): Promise<Ok<{ code: string }> | Err> {
  const t = await loadTicket(input.tenantId, input.ticketId);
  if (!t) return { ok: false, error: "Ticket no encontrado" };
  if (t.priority === input.priority) return { ok: false, error: "El ticket ya tiene esa prioridad" };
  await prisma.opsTicket.update({ where: { id: t.id }, data: { priority: input.priority } });
  await recordTicketEvent({
    tenantId: input.tenantId, ticketId: t.id, type: "priority_changed", actorId: input.actorId,
    data: { from: t.priority, to: input.priority, source: "slack" },
  });
  return { ok: true, code: t.code };
}

export async function reassignTicket(input: {
  tenantId: string;
  actorId: string;
  ticketId: string;
  assignedTo?: string | null;
  assignedTeam?: string | null;
}): Promise<Ok<{ code: string }> | Err> {
  const t = await loadTicket(input.tenantId, input.ticketId);
  if (!t) return { ok: false, error: "Ticket no encontrado" };
  // El responsable es inmutable en tickets terminales (resuelto/cancelado…):
  // conserva su responsable histórico por trazabilidad; no se reasigna ni desasigna.
  if (input.assignedTo !== undefined && isTerminalStatus(t.status)) {
    return { ok: false, error: "No se puede cambiar el responsable de un ticket resuelto o cancelado." };
  }
  const data: { assignedTo?: string | null; assignedTeam?: string } = {};
  if (input.assignedTo !== undefined) data.assignedTo = input.assignedTo;
  if (input.assignedTeam) data.assignedTeam = input.assignedTeam;
  if (Object.keys(data).length === 0) return { ok: false, error: "Nada que reasignar" };

  await prisma.opsTicket.update({ where: { id: t.id }, data });
  if (input.assignedTo !== undefined && input.assignedTo !== t.assignedTo) {
    await recordTicketEvent({
      tenantId: input.tenantId, ticketId: t.id, type: "assignee_changed", actorId: input.actorId,
      data: { from: t.assignedTo, to: input.assignedTo, source: "slack" },
    });
  }
  if (input.assignedTeam && input.assignedTeam !== t.assignedTeam) {
    await recordTicketEvent({
      tenantId: input.tenantId, ticketId: t.id, type: "team_changed", actorId: input.actorId,
      data: { from: t.assignedTeam, to: input.assignedTeam, source: "slack" },
    });
  }
  if (input.assignedTo && input.assignedTo !== input.actorId) {
    const { notifyTicketAssigned } = await import("@/lib/notifications/notify-ticket-assigned");
    await notifyTicketAssigned({
      tenantId: input.tenantId, ticketId: t.id, ticketCode: t.code, ticketTitle: t.title,
      ticketPriority: t.priority, ticketAssignedTeam: input.assignedTeam ?? t.assignedTeam,
      assigneeId: input.assignedTo, assignedById: input.actorId, source: "patch",
    }).catch((err) => console.error("[tickets] notify reasignación:", err));
  }
  return { ok: true, code: t.code };
}

/**
 * "Tomar" un ticket sin responsable: asigna al propio actor. Idempotente y
 * anti-carrera — el update es condicional (`assignedTo: null`), así que si otro
 * lo tomó primero devuelve `raced: true` en vez de pisar la asignación ajena.
 * No notifica (uno se asigna a sí mismo): solo registra el evento estándar.
 */
export async function claimTicket(input: {
  tenantId: string;
  actorId: string;
  ticketId: string;
}): Promise<Ok<{ code: string; title: string }> | (Err & { raced?: boolean })> {
  const t = await loadTicket(input.tenantId, input.ticketId);
  if (!t) return { ok: false, error: "Ticket no encontrado" };
  if (isTerminalStatus(t.status)) {
    return { ok: false, error: "No se puede tomar un ticket resuelto o cancelado." };
  }
  if (t.assignedTo) {
    return { ok: false, error: "Este ticket ya tiene responsable.", raced: true };
  }
  const claimed = await prisma.opsTicket.updateMany({
    where: { id: t.id, tenantId: input.tenantId, assignedTo: null },
    data: { assignedTo: input.actorId },
  });
  if (claimed.count === 0) {
    return { ok: false, error: "Otro usuario lo tomó primero.", raced: true };
  }
  await recordTicketEvent({
    tenantId: input.tenantId, ticketId: t.id, type: "assignee_changed", actorId: input.actorId,
    data: { from: null, to: input.actorId, source: "slack", via: "tomar" },
  });
  return { ok: true, code: t.code, title: t.title };
}

export async function addTicketComment(input: {
  tenantId: string;
  actorId: string;
  ticketId: string;
  body: string;
}): Promise<Ok<{ code: string; commentId: string }> | Err> {
  const t = await loadTicket(input.tenantId, input.ticketId);
  if (!t) return { ok: false, error: "Ticket no encontrado" };
  const clean = input.body.trim();
  if (!clean) return { ok: false, error: "El comentario está vacío" };
  const comment = await prisma.opsTicketComment.create({
    data: { ticketId: t.id, userId: input.actorId, body: clean, isInternal: false },
    select: { id: true },
  });
  return { ok: true, code: t.code, commentId: comment.id };
}
