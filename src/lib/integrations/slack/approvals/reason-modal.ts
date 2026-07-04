/**
 * Modal de rechazo con MOTIVO OBLIGATORIO (Fase 13), compartido por la bandeja
 * unificada (origin=inbox) y las tarjetas accionables (origin=card).
 *
 * Se apila con una vista pre-construida (`rejectReasonView`); el submit se rutea
 * por `getModal("apx_reason").submit`. La capability se re-valida acá por dominio
 * (el servicio manda). Para origin=card además actualiza el mensaje-tarjeta.
 */

import { prisma } from "@/lib/prisma";
import { hasCapability, hasModuleAccess } from "@/lib/permissions";
import { rejectRendicion } from "@/lib/rendiciones-approvals";
import { rejectTe } from "@/lib/te-approvals";
import { decideTicketApproval } from "@/lib/tickets-approvals";
import { slackUpdateMessage } from "../api";
import { packMetadata } from "../modals/views";
import type { ModalDef, ModalSubmitContext, ModalSubmitResult, SlackView } from "../modals/types";

const pt = (text: string) => ({ type: "plain_text", text: text.slice(0, 75) });

export interface RejectReasonContext {
  domain: "ticket" | "rendicion" | "te";
  entityId: string;
  origin: "inbox" | "card";
  label: string; // p.ej. "REN-2025-0007" o "TE"
  pendingId?: string;
  channelId?: string;
  messageTs?: string;
}

/** Vista pre-construida del modal de rechazo. */
export function rejectReasonView(c: RejectReasonContext): SlackView {
  return {
    type: "modal",
    callback_id: "apx_reason",
    private_metadata: packMetadata({
      kind: "apx_reason", domain: c.domain, entityId: c.entityId, origin: c.origin,
      pendingId: c.pendingId, channelId2: c.channelId, messageTs2: c.messageTs,
    }),
    title: pt("Rechazar"),
    submit: pt("Rechazar"),
    close: pt("Cancelar"),
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: `Vas a *rechazar* ${c.label}. Indica el motivo (obligatorio).` } },
      { type: "input", block_id: "reason", label: pt("Motivo del rechazo"),
        element: { type: "plain_text_input", action_id: "v", multiline: true, min_length: 3, max_length: 500 } },
    ],
  };
}

function done(msg: string): ModalSubmitResult {
  return { ack: { response_action: "update", view: {
    type: "modal", title: pt("Listo"), close: pt("Cerrar"),
    blocks: [{ type: "section", text: { type: "mrkdwn", text: msg } }],
  } } };
}
const fieldError = (msg: string): ModalSubmitResult => ({ ack: { response_action: "errors", errors: { reason: msg } } });

function canDecide(domain: string, perms: Parameters<typeof hasModuleAccess>[0]): boolean {
  if (domain === "rendicion") return hasCapability(perms, "rendicion_approve");
  if (domain === "te") return hasCapability(perms, "te_approve");
  return hasModuleAccess(perms, "ops");
}

async function updateCard(ctx: ModalSubmitContext, m: ReturnType<typeof unpackMeta>, text: string): Promise<void> {
  if (m.origin !== "card" || !m.channelId2 || !m.messageTs2) return;
  await slackUpdateMessage(ctx.workspace.botToken, {
    channel: m.channelId2, ts: m.messageTs2, text,
    blocks: [{ type: "section", text: { type: "mrkdwn", text } }],
  }).catch(() => {});
  if (m.pendingId) await prisma.slackPendingAction.updateMany({ where: { id: m.pendingId }, data: { status: "CONFIRMED", resolvedBy: ctx.linked.adminId, resolvedAt: new Date() } }).catch(() => {});
}

function unpackMeta(ctx: ModalSubmitContext) {
  return {
    domain: ctx.metadata.domain ?? "", entityId: ctx.metadata.entityId ?? "",
    origin: ctx.metadata.origin ?? "inbox", pendingId: ctx.metadata.pendingId,
    channelId2: ctx.metadata.channelId2, messageTs2: ctx.metadata.messageTs2,
  };
}

async function submit(ctx: ModalSubmitContext): Promise<ModalSubmitResult> {
  const m = unpackMeta(ctx);
  const reason = (ctx.state.reason?.v?.value ?? "").trim();
  if (reason.length < 3) return fieldError("El motivo debe tener al menos 3 caracteres.");
  if (!m.entityId) return done("⚠️ No se pudo identificar el ítem.");
  if (!canDecide(m.domain, ctx.linked.perms)) return done("No tienes permiso para rechazar este ítem.");

  const admin = await prisma.admin.findUnique({ where: { id: ctx.linked.adminId }, select: { name: true, email: true } });
  const actorName = admin?.name ?? admin?.email ?? "un aprobador";
  const time = new Intl.DateTimeFormat("es-CL", { hour: "2-digit", minute: "2-digit", timeZone: "America/Santiago" }).format(new Date());

  if (m.domain === "ticket") {
    const r = await decideTicketApproval({ tenantId: ctx.tenantId, userId: ctx.linked.adminId, ticketId: m.entityId, decision: "rejected", comment: reason });
    if (!r.ok) { await updateCard(ctx, m, `⚠️ ${r.error ?? "Ya fue resuelto."}`); return done(`⚠️ ${r.error ?? "Ya fue resuelto."}`); }
    await updateCard(ctx, m, `❌ Ticket *${r.ticketCode ?? ""}* rechazado por ${actorName} a las ${time}`);
    return done(`❌ Ticket *${r.ticketCode ?? ""}* rechazado.`);
  }
  const r = m.domain === "rendicion"
    ? await rejectRendicion({ tenantId: ctx.tenantId, actorId: ctx.linked.adminId, actorName, rendicionId: m.entityId, reason })
    : await rejectTe({ tenantId: ctx.tenantId, actorId: ctx.linked.adminId, actorEmail: admin?.email, teId: m.entityId, reason });
  if (!r.ok) { await updateCard(ctx, m, `⚠️ ${r.error}`); return done(`⚠️ ${r.error}`); }
  const label = "code" in r ? `Rendición *${r.code}*` : "Turno extra";
  await updateCard(ctx, m, `❌ ${label} rechazado por ${actorName} a las ${time}`);
  return done(`❌ ${label} rechazado.`);
}

export const rejectReasonModal: ModalDef = {
  callbackId: "apx_reason",
  title: "Rechazar",
  build: () => ({ type: "modal", title: pt("Rechazar"), close: pt("Cerrar"), blocks: [] }),
  submit,
};
