/**
 * Submits de los modales por-fila (Fase 7). Cada uno re-valida identidad/permiso
 * (vía prepareViewSubmission), ejecuta el servicio compartido, registra auditoría
 * y devuelve una vista de confirmación. Ejecuta síncrono (mutaciones rápidas) para
 * poder mostrar el resultado; errores → mensaje en el modal.
 */

import { hasModuleAccess } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { transitionTicketStatus } from "@/lib/tickets-transition";
import { changeTicketPriority, reassignTicket, addTicketComment } from "@/lib/tickets-mutations";
import { infoView } from "../modals/views";
import type { ModalDef, ModalSubmitContext, ModalSubmitResult, SlackView } from "../modals/types";

const requires = (perms: Parameters<typeof hasModuleAccess>[0]) => hasModuleAccess(perms, "ops");

function done(title: string, msg: string): ModalSubmitResult {
  const view: SlackView = {
    type: "modal",
    title: { type: "plain_text", text: title.slice(0, 24) },
    close: { type: "plain_text", text: "Listo" },
    blocks: [{ type: "section", text: { type: "mrkdwn", text: msg } }],
  };
  return { ack: { response_action: "update", view } };
}
const fieldError = (block: string, msg: string): ModalSubmitResult => ({
  ack: { response_action: "errors", errors: { [block]: msg } },
});

async function audit(ctx: ModalSubmitContext, ticketId: string, action: string) {
  await logAudit({
    action: "UPDATE", entity: "OpsTicket", entityId: ticketId, tenantId: ctx.tenantId,
    userId: ctx.linked.adminId, details: { via: "slack_tray", action },
  }).catch(() => {});
}

const commentModal: ModalDef = {
  callbackId: "tray_comment", title: "Comentar", requires, build: () => infoView("Comentar", ""),
  submit: async (ctx) => {
    const ticketId = ctx.metadata.ticketId ?? "";
    const body = ctx.state.body?.v?.value ?? "";
    if (!body.trim()) return fieldError("body", "Escribe un comentario.");
    const r = await addTicketComment({ tenantId: ctx.tenantId, actorId: ctx.linked.adminId, ticketId, body });
    if (!r.ok) return fieldError("body", r.error);
    await audit(ctx, ticketId, "comment");
    return done("Comentario", `💬 Comentario agregado a *${r.code}*.`);
  },
};

const statusModal: ModalDef = {
  callbackId: "tray_status", title: "Estado", requires, build: () => infoView("Estado", ""),
  submit: async (ctx) => {
    const ticketId = ctx.metadata.ticketId ?? "";
    const target = ctx.state.status?.v?.selected_option?.value;
    if (!target) return fieldError("status", "Elige un estado.");
    const r = await transitionTicketStatus({ tenantId: ctx.tenantId, actorId: ctx.linked.adminId, ticketId, targetStatus: target as never, source: "slack" });
    if (!r.ok) return fieldError("status", r.error);
    await audit(ctx, ticketId, `status:${target}`);
    return done("Estado", `🔄 *${r.ticket.code}* actualizado a *${target}*.`);
  },
};

const priorityModal: ModalDef = {
  callbackId: "tray_priority", title: "Prioridad", requires, build: () => infoView("Prioridad", ""),
  submit: async (ctx) => {
    const ticketId = ctx.metadata.ticketId ?? "";
    const priority = ctx.state.priority?.v?.selected_option?.value;
    if (!priority) return fieldError("priority", "Elige una prioridad.");
    const r = await changeTicketPriority({ tenantId: ctx.tenantId, actorId: ctx.linked.adminId, ticketId, priority });
    if (!r.ok) return fieldError("priority", r.error);
    await audit(ctx, ticketId, `priority:${priority}`);
    return done("Prioridad", `⚑ *${r.code}* ahora es ${priority.toUpperCase()}.`);
  },
};

const reassignModal: ModalDef = {
  callbackId: "tray_reassign", title: "Reasignar", requires, build: () => infoView("Reasignar", ""),
  submit: async (ctx) => {
    const ticketId = ctx.metadata.ticketId ?? "";
    const target = ctx.state.target?.v?.selected_option?.value;
    if (!target) return fieldError("target", "Elige un destino.");
    const input = target === "me"
      ? { assignedTo: ctx.linked.adminId }
      : { assignedTeam: target.replace(/^team:/, "") };
    const r = await reassignTicket({ tenantId: ctx.tenantId, actorId: ctx.linked.adminId, ticketId, ...input });
    if (!r.ok) return fieldError("target", r.error);
    await audit(ctx, ticketId, `reassign:${target}`);
    return done("Reasignado", `👤 *${r.code}* reasignado.`);
  },
};

function confirmModal(callbackId: string, target: "resolved" | "cancelled", label: string): ModalDef {
  return {
    callbackId, title: label, requires, build: () => infoView(label, ""),
    submit: async (ctx) => {
      const ticketId = ctx.metadata.ticketId ?? "";
      const r = await transitionTicketStatus({ tenantId: ctx.tenantId, actorId: ctx.linked.adminId, ticketId, targetStatus: target, source: "slack" });
      if (!r.ok) return done(label, `⚠️ ${r.error}`);
      await audit(ctx, ticketId, `status:${target}`);
      return done(label, `${target === "resolved" ? "✅" : "🚫"} *${r.ticket.code}* → ${target}.`);
    },
  };
}

export const rowModals: ModalDef[] = [
  commentModal, statusModal, priorityModal, reassignModal,
  confirmModal("tray_close", "resolved", "Cerrar ticket"),
  confirmModal("tray_cancel", "cancelled", "Cancelar ticket"),
];
