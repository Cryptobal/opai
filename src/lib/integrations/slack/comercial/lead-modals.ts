/**
 * Modal secundario del cockpit de leads (Fase 15, B1): Descartar con motivo.
 * Se abre desde la bandeja (views.push) o desde la tarjeta del canal (views.open).
 * Lleva el leadId en private_metadata (contexto, no autoridad).
 */

import { canEdit } from "@/lib/permissions";
import { discardLead, DISCARD_REASONS } from "./lead-actions";
import { packMetadata } from "../modals/views";
import { modalTitle } from "../modals/title";
import type { ModalDef, ModalSubmitResult, SlackView } from "../modals/types";

const pt = (text: string) => ({ type: "plain_text", text: text.slice(0, 75), emoji: true });
const opt = (value: string, label: string) => ({ text: pt(label), value });

export function discardLeadModalView(leadId: string, name?: string): SlackView {
  return {
    type: "modal",
    callback_id: "leadtray_discard",
    private_metadata: packMetadata({ kind: "lead_discard", leadId }),
    title: modalTitle("Descartar lead"),
    submit: pt("Descartar"),
    close: pt("Cancelar"),
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: `Descartar${name ? ` *${name}*` : " este lead"}. Queda registrado con motivo.` } },
      { type: "input", block_id: "reason", label: pt("Motivo"),
        element: { type: "static_select", action_id: "v", options: DISCARD_REASONS.map(([v, l]) => opt(v, l)) } },
      { type: "input", block_id: "note", optional: true, label: pt("Nota (opcional)"),
        element: { type: "plain_text_input", action_id: "v", multiline: true, max_length: 500 } },
    ],
  };
}

function done(msg: string): ModalSubmitResult {
  return {
    ack: {
      response_action: "update",
      view: { type: "modal", title: { type: "plain_text", text: "Descartar lead" }, close: { type: "plain_text", text: "Listo" }, blocks: [{ type: "section", text: { type: "mrkdwn", text: msg } }] },
    },
  };
}

export const discardLeadModal: ModalDef = {
  callbackId: "leadtray_discard",
  title: "Descartar lead",
  requires: (perms) => canEdit(perms, "crm", "leads"),
  requiresMessage: "Necesitas permiso de edición en Leads (CRM).",
  build: () => discardLeadModalView(""),
  submit: async (ctx): Promise<ModalSubmitResult> => {
    const leadId = ctx.metadata.leadId ?? "";
    const reason = ctx.state.reason?.v?.selected_option?.value;
    const note = ctx.state.note?.v?.value ?? "";
    if (!reason) return { ack: { response_action: "errors", errors: { reason: "Elige un motivo." } } };
    const r = await discardLead(ctx.tenantId, ctx.linked.adminId, leadId, reason, note);
    if (!r.ok) return done(`⚠️ ${r.error}`);
    return done(`❌ Lead *${r.name}* descartado.`);
  },
};
