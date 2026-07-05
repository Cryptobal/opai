/**
 * "Guardar en OPAI" (Fase 16, B3) — shortcut de mensaje `opai_guardar`.
 *
 * Desde cualquier mensaje de Slack se guarda una nota polimórfica (`CrmNote`)
 * con el autor REAL y un link permanente al mensaje. Dos caminos:
 *  - El canal ES una sala de negocio → nota directa al deal (1 clic + texto opc).
 *  - Si no → buscador de entidad (cuenta / negocio / lead) por external_select.
 * Archivos adjuntos del mensaje → R2 (reusa `ingestSlackFiles`) + link en el
 * contenido. Si el deal tiene sala, la nota se espeja (o se confirma en el hilo).
 */

import { prisma } from "@/lib/prisma";
import { canEdit, canView } from "@/lib/permissions";
import { getTenantForTeam, getWorkspaceForTenant } from "../workspace";
import { resolveLinkedAdmin } from "../user-link";
import { slackFetchMessage, slackGetPermalink, slackPostMessage } from "../api";
import { ingestSlackFiles } from "../bridge-inbound-files";
import { packMetadata } from "../modals/views";
import { modalTitle } from "../modals/title";
import { INTERACTION_TYPES, interactionLabel, isInteractionType, type InteractionTypeMeta } from "@/lib/crm/interaction-types";
import type { ModalDef, ModalOpenContext, ModalSubmitContext, ModalSubmitResult, SlackView } from "../modals/types";
import { getDealRoomByChannel, getOpenDealRoom, mirrorDealNoteToRoom } from "./room";

const pt = (text: string) => ({ type: "plain_text", text: text.slice(0, 75), emoji: true });

const ENTITY_EMOJI: Record<string, string> = { deal: "💼", account: "🏢", lead: "🌱" };

function previewBlock(text: string): unknown {
  const clean = (text || "").trim().replace(/\n+/g, " ").slice(0, 240);
  return { type: "context", elements: [{ type: "mrkdwn", text: clean ? `Mensaje: “${clean}”` : "Se guardará el mensaje seleccionado." }] };
}

const typeOption = (t: InteractionTypeMeta) => ({ text: pt(`${t.emoji} ${t.label}`), value: t.key });

/** Selector de tipo de interacción (default 📝 Nota) + fecha opcional. */
const typeAndDateInputs: unknown[] = [
  {
    type: "input", block_id: "itype", optional: true, label: pt("Tipo de interacción"),
    element: { type: "static_select", action_id: "v", initial_option: typeOption(INTERACTION_TYPES[0]), options: INTERACTION_TYPES.map(typeOption) },
  },
  {
    type: "input", block_id: "idate", optional: true, label: pt("¿Cuándo ocurrió? (opcional)"),
    element: { type: "datepicker", action_id: "v", placeholder: pt("Fecha de la interacción") },
  },
];

const noteInput: unknown = {
  type: "input", block_id: "note", optional: true, label: pt("Nota (opcional)"),
  element: { type: "plain_text_input", action_id: "v", multiline: true, max_length: 2000, placeholder: pt("Contexto o comentario…") },
};

/** Vista cuando el mensaje está en una sala de negocio: guardado directo al deal. */
function roomSaveView(p: { dealId: string; dealTitle: string; channelId: string; messageTs: string; preview: string }): SlackView {
  return {
    type: "modal", callback_id: "opai_guardar",
    private_metadata: packMetadata({ kind: "opai_guardar", dealId: p.dealId, channelId: p.channelId, messageTs: p.messageTs }),
    title: modalTitle("Guardar en OPAI"), submit: pt("Guardar"), close: pt("Cancelar"),
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: `Se guardará en el negocio *${p.dealTitle}*.` } },
      previewBlock(p.preview),
      ...typeAndDateInputs,
      noteInput,
    ],
  };
}

/** Vista cuando NO es una sala: buscador de entidad (cuenta / negocio / lead). */
function searchSaveView(p: { channelId: string; messageTs: string; preview: string }): SlackView {
  return {
    type: "modal", callback_id: "opai_guardar",
    private_metadata: packMetadata({ kind: "opai_guardar", channelId: p.channelId, messageTs: p.messageTs }),
    title: modalTitle("Guardar en OPAI"), submit: pt("Guardar"), close: pt("Cancelar"),
    blocks: [
      previewBlock(p.preview),
      {
        type: "input", block_id: "entity", label: pt("Guardar en"),
        element: { type: "external_select", action_id: "v", min_query_length: 2, placeholder: pt("Busca cuenta, negocio o lead…") },
      },
      ...typeAndDateInputs,
      noteInput,
    ],
  };
}

function doneView(msg: string): ModalSubmitResult {
  return {
    ack: {
      response_action: "update",
      view: { type: "modal", title: { type: "plain_text", text: "Guardar en OPAI".slice(0, 24) }, close: { type: "plain_text", text: "Listo" }, blocks: [{ type: "section", text: { type: "mrkdwn", text: msg } }] },
    },
  };
}

/* ── ModalDef ── */

export const saveNoteModal: ModalDef = {
  callbackId: "opai_guardar",
  title: "Guardar en OPAI",
  requires: (perms) => canEdit(perms, "crm"),
  requiresMessage: "Necesitas permiso de edición de CRM para guardar notas.",
  build: async (ctx: ModalOpenContext) => {
    const channelId = ctx.channelId ?? "";
    const messageTs = ctx.messageTs ?? "";
    const preview = ctx.messageText ?? "";
    const room = channelId ? await getDealRoomByChannel(ctx.tenantId, channelId) : null;
    if (room && room.status === "OPEN") {
      const deal = await prisma.crmDeal.findFirst({ where: { id: room.dealId, tenantId: ctx.tenantId }, select: { title: true } });
      return roomSaveView({ dealId: room.dealId, dealTitle: deal?.title ?? "este negocio", channelId, messageTs, preview });
    }
    return searchSaveView({ channelId, messageTs, preview });
  },
  submit: async (ctx: ModalSubmitContext): Promise<ModalSubmitResult> => {
    const md = ctx.metadata;
    const channelId = md.channelId ?? "";
    const messageTs = md.messageTs ?? "";
    const noteText = (ctx.state.note?.v?.value ?? "").trim();

    let entityType = "deal";
    let entityId = md.dealId ?? "";
    if (!entityId) {
      const sel = ctx.state.entity?.v?.selected_option?.value ?? "";
      const [t, id] = sel.split(":");
      if (!t || !id) return { ack: { response_action: "errors", errors: { entity: "Elige a qué cuenta, negocio o lead guardar." } } };
      entityType = t;
      entityId = id;
    }

    // Tipo de interacción (default note) + fecha opcional (datepicker YYYY-MM-DD).
    const rawType = ctx.state.itype?.v?.selected_option?.value ?? null;
    const interactionType = isInteractionType(rawType) ? rawType : "note";
    const occurredDate = ctx.state.idate?.v?.selected_date ?? null;
    const occurredAt = occurredDate ? new Date(`${occurredDate}T12:00:00Z`) : null;

    const label = entityType === "deal" ? "el negocio" : entityType === "account" ? "la cuenta" : "el lead";
    // El armado del contenido (fetch del mensaje + permalink + archivos a R2) es
    // pesado → se difiere a after(); el modal confirma de inmediato.
    return {
      ...doneView(`${interactionLabel(interactionType)} guardada en ${label}. Aparecerá en OPAI en segundos.`),
      work: async () => {
        await persistSlackNote({
          tenantId: ctx.tenantId, adminId: ctx.linked.adminId,
          entityType, entityId, channelId, messageTs, noteText, interactionType, occurredAt,
        });
      },
    };
  },
};

/* ── Persistencia (después del ACK) ── */

async function persistSlackNote(p: {
  tenantId: string; adminId: string;
  entityType: string; entityId: string; channelId: string; messageTs: string; noteText: string;
  interactionType?: string; occurredAt?: Date | null;
}): Promise<void> {
  const ws = await getWorkspaceForTenant(p.tenantId);
  if (!ws) return;
  const admin = await prisma.admin.findFirst({ where: { id: p.adminId, tenantId: p.tenantId }, select: { name: true } }).catch(() => null);
  const authorName = admin?.name ?? "Alguien";

  const [msg, permalink] = await Promise.all([
    p.channelId && p.messageTs ? slackFetchMessage(ws.botToken, p.channelId, p.messageTs) : Promise.resolve(null),
    p.channelId && p.messageTs ? slackGetPermalink(ws.botToken, p.channelId, p.messageTs) : Promise.resolve(null),
  ]);
  const { attachments, links } = await ingestSlackFiles(msg?.files, ws.botToken, p.tenantId).catch(() => ({ attachments: [], links: [] as string[] }));

  const quoted = (msg?.text ?? "").trim();
  let content = "";
  if (p.noteText) content += `${p.noteText}\n\n`;
  if (quoted) content += `> ${quoted.replace(/\n/g, "\n> ")}\n`;
  for (const a of attachments) content += `📎 [${a.fileName}](${a.fileUrl})\n`;
  for (const l of links) content += `${l}\n`;
  if (permalink) content += `\n🔗 [Ver mensaje en Slack](${permalink})`;
  content = content.trim() || "(nota guardada desde Slack)";

  await prisma.crmNote.create({
    data: {
      tenantId: p.tenantId, entityType: p.entityType, entityId: p.entityId, content, mentions: [], createdBy: p.adminId,
      interactionType: p.interactionType ?? null, occurredAt: p.occurredAt ?? null,
    },
  }).catch((e) => console.error("[slack] persistSlackNote crear CrmNote falló:", e));

  // Espejo a la sala del negocio (decisión B2/B3): si el deal tiene sala.
  if (p.entityType === "deal") {
    const room = await getOpenDealRoom(p.tenantId, p.entityId);
    if (room && room.slackChannelId === p.channelId) {
      // Guardado desde su propia sala → confirmación en el hilo (sin duplicar).
      await slackPostMessage(ws.botToken, {
        channel: p.channelId, thread_ts: p.messageTs, text: "✅ Guardado en el negocio (visible en OPAI).",
      }).catch(() => {});
    } else if (room) {
      await mirrorDealNoteToRoom(p.tenantId, p.entityId, content, authorName).catch(() => {});
    }
  }
}

/* ── Buscador de entidad (block_suggestion del external_select) ── */

export async function handleSaveNoteSuggestion(
  payload: { team?: { id?: string }; user?: { id?: string }; value?: string },
): Promise<{ options: unknown[] }> {
  const teamId = payload.team?.id;
  const slackUserId = payload.user?.id;
  const query = (payload.value ?? "").trim();
  if (!teamId || !slackUserId || query.length < 2) return { options: [] };

  const resolved = await getTenantForTeam(teamId);
  if (!resolved) return { options: [] };
  const workspace = await getWorkspaceForTenant(resolved.tenantId);
  if (!workspace) return { options: [] };
  const linked = await resolveLinkedAdmin(workspace, slackUserId);
  if (!linked || !canView(linked.perms, "crm")) return { options: [] };
  const tenantId = workspace.tenantId;

  const [deals, accounts, leads] = await Promise.all([
    prisma.crmDeal.findMany({
      where: { tenantId, OR: [{ title: { contains: query, mode: "insensitive" } }, { account: { name: { contains: query, mode: "insensitive" } } }] },
      orderBy: { updatedAt: "desc" }, take: 6, select: { id: true, title: true, account: { select: { name: true } } },
    }),
    prisma.crmAccount.findMany({
      where: { tenantId, name: { contains: query, mode: "insensitive" } },
      orderBy: { updatedAt: "desc" }, take: 4, select: { id: true, name: true },
    }),
    prisma.crmLead.findMany({
      where: { tenantId, OR: [{ companyName: { contains: query, mode: "insensitive" } }, { firstName: { contains: query, mode: "insensitive" } }, { lastName: { contains: query, mode: "insensitive" } }] },
      orderBy: { createdAt: "desc" }, take: 4, select: { id: true, firstName: true, lastName: true, companyName: true },
    }),
  ]);

  const opt = (type: string, id: string, name: string) => ({
    text: pt(`${ENTITY_EMOJI[type] ?? ""} ${name}`.slice(0, 72)),
    value: `${type}:${id}`,
  });

  const options: unknown[] = [
    ...deals.map((d) => opt("deal", d.id, `${d.account?.name ?? d.title} · negocio`)),
    ...accounts.map((a) => opt("account", a.id, `${a.name} · cuenta`)),
    ...leads.map((l) => opt("lead", l.id, `${[l.companyName, `${l.firstName} ${l.lastName}`.trim()].filter(Boolean)[0] ?? "Lead"} · lead`)),
  ].slice(0, 100);

  return { options };
}
