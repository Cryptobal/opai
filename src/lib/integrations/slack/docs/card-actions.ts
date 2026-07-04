/**
 * Documentos gestionables desde la tarjeta de Slack (Fase 18).
 *
 * La tarjeta individual (día 0 / vencidos / T-7 y T-1 crítico-legal) trae:
 *   📄 Ver documento (deep link) · ⏳ En trámite · 🔕 Ya no aplica
 *
 * "En trámite" pide fecha compromiso y silencia TODA la escalera del documento
 * hasta esa fecha (renewalInProgressUntil + quién). "Ya no aplica" exige motivo
 * y queda auditado; el documento sale del motor. Ambas deciden con chat.update
 * sobre la tarjeta original. Los mismos modales sirven a la bandeja
 * (/opai documentos) vía el select por fila.
 */

import { prisma } from "@/lib/prisma";
import { format } from "date-fns";
import { logAudit } from "@/lib/audit";
import { hasModuleAccess } from "@/lib/permissions";
import { getCanonicalSiteUrl } from "@/lib/emails/site-url";
import { getTenantForTeam, getWorkspaceForTenant } from "../workspace";
import { resolveLinkedAdmin } from "../user-link";
import { slackOpenView, slackPushView, slackUpdateMessage } from "../api";
import { packMetadata } from "../modals/views";
import { modalTitle } from "../modals/title";
import type { ModalDef, ModalSubmitContext, SlackView } from "../modals/types";
import { describeDue, calcDaysRemaining, todayUtc, type ExpiryDocKind } from "@/lib/documents/expiry-engine";

const pt = (text: string) => ({ type: "plain_text", text: text.slice(0, 75) });

// ==========================================
// Fila de acciones de la tarjeta
// ==========================================

/** Botones de la tarjeta individual. `docRef` = "operacional:<id>" | "guardia:<id>". */
export function docCardActionsBlock(docRef: string, link: string | null): unknown {
  const elements: unknown[] = [];
  if (link) {
    const url = /^https?:\/\//.test(link) ? link : `${getCanonicalSiteUrl()}${link}`;
    elements.push({
      type: "button",
      action_id: "doccard_view",
      value: docRef,
      url,
      text: pt("📄 Ver documento"),
    });
  }
  elements.push(
    { type: "button", action_id: "doccard_track", value: docRef, text: pt("⏳ En trámite") },
    { type: "button", action_id: "doccard_dismiss", value: docRef, text: pt("🔕 Ya no aplica") },
  );
  return { type: "actions", block_id: `opai_doccard_${docRef}`, elements };
}

// ==========================================
// Carga del documento por ref
// ==========================================

export type DocRefInfo = {
  kind: ExpiryDocKind;
  id: string;
  label: string;
  contextLabel: string;
  expiresAt: Date | null;
};

export function parseDocRef(raw: string | undefined | null): { kind: ExpiryDocKind; id: string } | null {
  const [kind, id] = (raw ?? "").split(":");
  if ((kind !== "operacional" && kind !== "guardia") || !id) return null;
  return { kind, id };
}

export async function loadDocByRef(
  tenantId: string,
  ref: { kind: ExpiryDocKind; id: string }
): Promise<DocRefInfo | null> {
  if (ref.kind === "operacional") {
    const doc = await prisma.docOperacional.findFirst({
      where: { id: ref.id, tenantId },
      include: {
        tipo: { select: { nombre: true } },
        installation: { select: { name: true } },
      },
    });
    if (!doc) return null;
    return {
      kind: "operacional",
      id: doc.id,
      label: doc.tipo.nombre,
      contextLabel: doc.installation?.name ?? "Global",
      expiresAt: doc.expiresAt,
    };
  }
  const doc = await prisma.opsDocumentoPersona.findFirst({
    where: { id: ref.id, tenantId },
    include: { guardia: { include: { persona: { select: { firstName: true, lastName: true } } } } },
  });
  if (!doc) return null;
  return {
    kind: "guardia",
    id: doc.id,
    label: doc.type,
    contextLabel: `${doc.guardia.persona.firstName} ${doc.guardia.persona.lastName}`.trim(),
    expiresAt: doc.expiresAt,
  };
}

function docContextText(info: DocRefInfo): string {
  const due = info.expiresAt
    ? describeDue(calcDaysRemaining(new Date(info.expiresAt), todayUtc()), new Date(info.expiresAt))
    : "sin fecha de vencimiento";
  return `*${info.label}* — ${info.contextLabel}\n${due}`;
}

// ==========================================
// Modales
// ==========================================

export function buildTrackModalView(
  info: DocRefInfo,
  docRef: string,
  card?: { channelId?: string; messageTs?: string }
): SlackView {
  return {
    type: "modal",
    callback_id: "opai_doc_track",
    private_metadata: packMetadata({
      kind: "doc_track",
      docRef,
      channelId2: card?.channelId,
      messageTs2: card?.messageTs,
    }),
    title: modalTitle("En trámite"),
    submit: pt("Guardar"),
    close: pt("Cancelar"),
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: docContextText(info) } },
      {
        type: "input",
        block_id: "doc_track_b",
        label: pt("Fecha compromiso de renovación"),
        element: { type: "datepicker", action_id: "doc_track_date", placeholder: pt("Selecciona la fecha") },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: "El sistema silencia *todos* los avisos de este documento hasta esa fecha. Si al llegar no se renovó, la escalera reanuda sola.",
          },
        ],
      },
    ],
  };
}

export function buildDismissModalView(
  info: DocRefInfo,
  docRef: string,
  card?: { channelId?: string; messageTs?: string }
): SlackView {
  return {
    type: "modal",
    callback_id: "opai_doc_dismiss",
    private_metadata: packMetadata({
      kind: "doc_dismiss",
      docRef,
      channelId2: card?.channelId,
      messageTs2: card?.messageTs,
    }),
    title: modalTitle("Ya no aplica"),
    submit: pt("Confirmar"),
    close: pt("Cancelar"),
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: docContextText(info) } },
      {
        type: "input",
        block_id: "doc_dismiss_b",
        label: pt("Motivo"),
        element: {
          type: "plain_text_input",
          action_id: "doc_dismiss_reason",
          multiline: true,
          placeholder: pt("Ej.: instalación cerrada, documento reemplazado…"),
        },
      },
      {
        type: "context",
        elements: [
          { type: "mrkdwn", text: "El documento deja de generar avisos y sale del digest. Queda auditado." },
        ],
      },
    ],
  };
}

// ==========================================
// Click en los botones de la tarjeta
// ==========================================

export async function handleDocCardAction(payload: Record<string, unknown>): Promise<void> {
  const teamId = (payload.team as { id?: string } | undefined)?.id;
  const triggerId = payload.trigger_id as string | undefined;
  const slackUserId = (payload.user as { id?: string } | undefined)?.id;
  const action = (payload.actions as Array<{ action_id?: string; value?: string }> | undefined)?.[0];
  const actionId = action?.action_id;
  if (!teamId || !slackUserId || !actionId) return;
  if (actionId === "doccard_view") return; // botón URL: Slack navega, nada que hacer

  const ref = parseDocRef(action?.value);
  if (!ref || !triggerId) return;

  const resolved = await getTenantForTeam(teamId);
  if (!resolved) return;
  const workspace = await getWorkspaceForTenant(resolved.tenantId);
  if (!workspace) return;
  const linked = await resolveLinkedAdmin(workspace, slackUserId);
  if (!linked || !hasModuleAccess(linked.perms, "ops")) return;

  const info = await loadDocByRef(workspace.tenantId, ref);
  if (!info) return;

  const card = {
    channelId: (payload.channel as { id?: string } | undefined)?.id,
    messageTs: (payload.container as { message_ts?: string } | undefined)?.message_ts,
  };
  const docRef = `${ref.kind}:${ref.id}`;
  const view =
    actionId === "doccard_track"
      ? buildTrackModalView(info, docRef, card)
      : buildDismissModalView(info, docRef, card);
  await slackOpenView(workspace.botToken, triggerId, view);
}

/** Desde la bandeja (modal en pila): apila el modal de gestión de la fila. */
export async function pushDocRowModal(
  botToken: string,
  triggerId: string,
  tenantId: string,
  op: string,
  rawRef: string
): Promise<void> {
  const ref = parseDocRef(rawRef);
  if (!ref) return;
  const info = await loadDocByRef(tenantId, ref);
  if (!info) return;
  const docRef = `${ref.kind}:${ref.id}`;
  const view = op === "track" ? buildTrackModalView(info, docRef) : buildDismissModalView(info, docRef);
  await slackPushView(botToken, triggerId, view);
}

// ==========================================
// Submits
// ==========================================

async function updateCardIfPresent(
  ctx: ModalSubmitContext,
  text: string
): Promise<void> {
  const channel = ctx.metadata.channelId2;
  const ts = ctx.metadata.messageTs2;
  if (!channel || !ts) return;
  await slackUpdateMessage(ctx.workspace.botToken, {
    channel,
    ts,
    text,
    blocks: [{ type: "section", text: { type: "mrkdwn", text } }],
  }).catch(() => {});
}

export const docTrackModal: ModalDef = {
  callbackId: "opai_doc_track",
  title: "En trámite",
  requires: (perms) => hasModuleAccess(perms, "ops"),
  build: async () => ({}) as SlackView, // siempre se abre pre-construido (tarjeta o bandeja)
  submit: async (ctx) => {
    const ref = parseDocRef(ctx.metadata.docRef);
    if (!ref) return { ack: {} };
    const selected = ctx.state.doc_track_b?.doc_track_date?.selected_date;
    if (!selected) {
      return { ack: { response_action: "errors", errors: { doc_track_b: "Selecciona la fecha compromiso." } } };
    }
    const until = new Date(`${selected}T00:00:00Z`);
    if (Number.isNaN(until.getTime()) || until.getTime() < todayUtc().getTime()) {
      return { ack: { response_action: "errors", errors: { doc_track_b: "La fecha debe ser hoy o futura." } } };
    }
    return {
      ack: {},
      work: async () => {
        const data = {
          renewalInProgressUntil: until,
          renewalMarkedBy: ctx.linked.adminId,
          renewalMarkedAt: new Date(),
        };
        if (ref.kind === "operacional") {
          await prisma.docOperacional.updateMany({ where: { id: ref.id, tenantId: ctx.tenantId }, data });
        } else {
          await prisma.opsDocumentoPersona.updateMany({ where: { id: ref.id, tenantId: ctx.tenantId }, data });
        }
        const info = await loadDocByRef(ctx.tenantId, ref);
        await logAudit({
          tenantId: ctx.tenantId,
          userId: ctx.linked.adminId,
          action: "UPDATE",
          entity: ref.kind === "operacional" ? "doc_operacional" : "ops_documento_persona",
          entityId: ref.id,
          details: { event: "doc_expiry.renewal_in_progress", until: selected, via: "slack" },
        });
        const fecha = format(until, "dd/MM/yyyy");
        await updateCardIfPresent(
          ctx,
          `⏳ *En trámite hasta el ${fecha}* — ${info ? `${info.label} (${info.contextLabel})` : "documento"} · marcado por <@${ctx.slackUserId}>. Avisos silenciados hasta esa fecha.`
        );
      },
    };
  },
};

export const docDismissModal: ModalDef = {
  callbackId: "opai_doc_dismiss",
  title: "Ya no aplica",
  requires: (perms) => hasModuleAccess(perms, "ops"),
  build: async () => ({}) as SlackView,
  submit: async (ctx) => {
    const ref = parseDocRef(ctx.metadata.docRef);
    if (!ref) return { ack: {} };
    const reason = (ctx.state.doc_dismiss_b?.doc_dismiss_reason?.value ?? "").trim();
    if (!reason) {
      return { ack: { response_action: "errors", errors: { doc_dismiss_b: "El motivo es obligatorio." } } };
    }
    return {
      ack: {},
      work: async () => {
        const data = {
          expiryDismissedAt: new Date(),
          expiryDismissedBy: ctx.linked.adminId,
          expiryDismissedReason: reason.slice(0, 500),
        };
        if (ref.kind === "operacional") {
          await prisma.docOperacional.updateMany({ where: { id: ref.id, tenantId: ctx.tenantId }, data });
        } else {
          await prisma.opsDocumentoPersona.updateMany({ where: { id: ref.id, tenantId: ctx.tenantId }, data });
        }
        const info = await loadDocByRef(ctx.tenantId, ref);
        await logAudit({
          tenantId: ctx.tenantId,
          userId: ctx.linked.adminId,
          action: "UPDATE",
          entity: ref.kind === "operacional" ? "doc_operacional" : "ops_documento_persona",
          entityId: ref.id,
          details: { event: "doc_expiry.dismissed", reason: reason.slice(0, 500), via: "slack" },
        });
        await updateCardIfPresent(
          ctx,
          `🔕 *Ya no aplica* — ${info ? `${info.label} (${info.contextLabel})` : "documento"} · marcado por <@${ctx.slackUserId}>: ${reason.slice(0, 200)}`
        );
      },
    };
  },
};
