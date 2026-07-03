/**
 * Modales secundarios (views.push) de la bandeja de tickets (Fase 7): comentar,
 * cambiar estado, cambiar prioridad, reasignar, y confirmar cerrar/cancelar.
 * Cada uno lleva el `ticketId` en private_metadata (contexto, no autoridad).
 */

import { TICKET_STATUS_CONFIG, TICKET_PRIORITY_CONFIG, TICKET_TEAM_CONFIG } from "@/lib/tickets";
import { packMetadata } from "../modals/views";
import type { SlackView } from "../modals/types";

const pt = (text: string) => ({ type: "plain_text", text: text.slice(0, 75) });
const opt = (value: string, label: string) => ({ text: pt(label), value });
const meta = (ticketId: string) => packMetadata({ kind: "tray_row", ticketId });

function shell(callbackId: string, ticketId: string, title: string, submit: string, blocks: unknown[]): SlackView {
  return {
    type: "modal",
    callback_id: callbackId,
    private_metadata: meta(ticketId),
    title: pt(title),
    submit: pt(submit),
    close: pt("Cancelar"),
    blocks,
  };
}

export function commentModalView(ticketId: string, code: string): SlackView {
  return shell("tray_comment", ticketId, `Comentar ${code}`, "Enviar", [
    { type: "input", block_id: "body", label: pt("Comentario"),
      element: { type: "plain_text_input", action_id: "v", multiline: true, max_length: 2000 } },
  ]);
}

export function statusModalView(ticketId: string, code: string): SlackView {
  const options = ["open", "in_progress", "waiting", "resolved", "cancelled"].map((s) =>
    opt(s, TICKET_STATUS_CONFIG[s as keyof typeof TICKET_STATUS_CONFIG]?.label ?? s),
  );
  return shell("tray_status", ticketId, `Estado ${code}`, "Cambiar", [
    { type: "input", block_id: "status", label: pt("Nuevo estado"),
      element: { type: "static_select", action_id: "v", options } },
  ]);
}

export function priorityModalView(ticketId: string, code: string): SlackView {
  const options = ["p1", "p2", "p3", "p4"].map((p) =>
    opt(p, TICKET_PRIORITY_CONFIG[p as keyof typeof TICKET_PRIORITY_CONFIG]?.label ?? p),
  );
  return shell("tray_priority", ticketId, `Prioridad ${code}`, "Cambiar", [
    { type: "input", block_id: "priority", label: pt("Nueva prioridad"),
      element: { type: "static_select", action_id: "v", options } },
  ]);
}

export function reassignModalView(ticketId: string, code: string): SlackView {
  const teams = Object.entries(TICKET_TEAM_CONFIG).map(([slug, cfg]) => opt(`team:${slug}`, `Equipo: ${cfg.label}`));
  const options = [opt("me", "Asignarme a mí"), ...teams];
  return shell("tray_reassign", ticketId, `Reasignar ${code}`, "Reasignar", [
    { type: "input", block_id: "target", label: pt("Reasignar a"),
      element: { type: "static_select", action_id: "v", options } },
  ]);
}

/** Aplazar SLA: nueva fecha (datepicker) + motivo (≥10). */
export function aplazarModalView(ticketId: string, code: string): SlackView {
  return shell("tray_aplazar", ticketId, `Aplazar SLA ${code}`, "Aplazar", [
    { type: "input", block_id: "date", label: pt("Nueva fecha límite"),
      element: { type: "datepicker", action_id: "v" } },
    { type: "input", block_id: "reason", label: pt("Motivo (mín. 10 caracteres)"),
      element: { type: "plain_text_input", action_id: "v", multiline: true, min_length: 10, max_length: 300 } },
  ]);
}

/** Pausar / reanudar SLA (el submit decide según el estado actual). */
export function pausarModalView(ticketId: string, code: string): SlackView {
  return shell("tray_pausar", ticketId, `SLA ${code}`, "Aplicar", [
    { type: "section", text: { type: "mrkdwn", text: `Pausa o reanuda el SLA de *${code}*. Si ya está pausado, se reanuda y el plazo se extiende por el tiempo pausado.` } },
    { type: "input", block_id: "reason", optional: true, label: pt("Motivo (al pausar)"),
      element: { type: "plain_text_input", action_id: "v", max_length: 200 } },
  ]);
}

/** Silenciar avisos por una duración (o reactivar). */
export function silenciarModalView(ticketId: string, code: string): SlackView {
  const options = [opt("1", "1 hora"), opt("4", "4 horas"), opt("24", "24 horas"), opt("0", "Reactivar avisos")];
  return shell("tray_silenciar", ticketId, `Silenciar ${code}`, "Aplicar", [
    { type: "input", block_id: "dur", label: pt("Silenciar por"),
      element: { type: "static_select", action_id: "v", options } },
  ]);
}

/** Confirmación de cerrar (resolver) o cancelar (terminal, auditable). */
export function confirmModalView(ticketId: string, code: string, op: "close" | "cancel"): SlackView {
  const verb = op === "close" ? "resolver" : "cancelar";
  const note = op === "cancel" ? " Cancelar deja el ticket en estado terminal (queda auditado)." : "";
  return shell(op === "close" ? "tray_close" : "tray_cancel", ticketId, `${op === "close" ? "Cerrar" : "Cancelar"} ${code}`, "Confirmar", [
    { type: "section", text: { type: "mrkdwn", text: `¿Seguro que quieres *${verb}* el ticket *${code}*?${note}` } },
  ]);
}
