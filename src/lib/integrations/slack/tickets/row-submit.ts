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
import { extendSla, togglePauseSla, snoozeSla } from "@/lib/tickets-sla";
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

const aplazarModal: ModalDef = {
  callbackId: "tray_aplazar", title: "Aplazar SLA", requires, build: () => infoView("Aplazar SLA", ""),
  submit: async (ctx) => {
    const ticketId = ctx.metadata.ticketId ?? "";
    const date = ctx.state.date?.v?.selected_date;
    const reason = ctx.state.reason?.v?.value ?? "";
    if (!date) return fieldError("date", "Elige una fecha.");
    if (reason.trim().length < 10) return fieldError("reason", "El motivo debe tener al menos 10 caracteres.");
    const r = await extendSla({ tenantId: ctx.tenantId, actorId: ctx.linked.adminId, ticketId, newDueAt: new Date(`${date}T23:59:59`), reason });
    if (!r.ok) return fieldError("date", r.error ?? "No se pudo aplazar.");
    await audit(ctx, ticketId, "sla_extend");
    return done("Aplazar SLA", `⏳ SLA de *${r.code}* aplazado al ${date}.`);
  },
};

const pausarModal: ModalDef = {
  callbackId: "tray_pausar", title: "SLA", requires, build: () => infoView("SLA", ""),
  submit: async (ctx) => {
    const ticketId = ctx.metadata.ticketId ?? "";
    const reason = ctx.state.reason?.v?.value ?? "";
    const r = await togglePauseSla({ tenantId: ctx.tenantId, actorId: ctx.linked.adminId, ticketId, reason });
    if (!r.ok) return done("SLA", `⚠️ ${r.error}`);
    await audit(ctx, ticketId, "sla_pause_toggle");
    return done("SLA", `⏸ SLA de *${r.code}* actualizado (pausado/reanudado).`);
  },
};

const silenciarModal: ModalDef = {
  callbackId: "tray_silenciar", title: "Silenciar", requires, build: () => infoView("Silenciar", ""),
  submit: async (ctx) => {
    const ticketId = ctx.metadata.ticketId ?? "";
    const dur = ctx.state.dur?.v?.selected_option?.value;
    if (dur === undefined) return fieldError("dur", "Elige una opción.");
    const hours = parseInt(dur, 10);
    const until = hours > 0 ? new Date(Date.now() + hours * 3600 * 1000) : null;
    const r = await snoozeSla({ tenantId: ctx.tenantId, actorId: ctx.linked.adminId, ticketId, until });
    if (!r.ok) return fieldError("dur", r.error ?? "No se pudo aplicar.");
    await audit(ctx, ticketId, "sla_snooze");
    return done("Silenciar", until ? `🔕 Avisos de *${r.code}* silenciados.` : `🔔 Avisos de *${r.code}* reactivados.`);
  },
};

export const rowModals: ModalDef[] = [
  commentModal, statusModal, priorityModal, reassignModal,
  aplazarModal, pausarModal, silenciarModal,
  confirmModal("tray_close", "resolved", "Cerrar ticket"),
  confirmModal("tray_cancel", "cancelled", "Cancelar ticket"),
];
