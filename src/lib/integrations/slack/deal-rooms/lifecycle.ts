/**
 * Ciclo de vida de una Deal Room (Fase 16, B5).
 *
 * `won`  → 🎉 en la sala + resumen del bot + botones "Archivar" / "Convertir en
 *          canal de operación" (el handoff comercial→ops que Salesforce no copia).
 * `lost` → mini post-mortem redactado desde la conversación (qué pasó · motivo)
 *          + botón "Archivar".
 * Archivar = conversations.archive + status ARCHIVED (el map se conserva para
 * historia). Handoff = renombra a `op-{slug}` y ofrece el link a la operación.
 */

import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { getCanonicalSiteUrl } from "@/lib/emails/site-url";
import { getWorkspaceForTenant } from "../workspace";
import { slackPostMessage, slackArchiveConversation, slackRenameConversation } from "../api";
import { getHelpChatAIConfig, createCompletion } from "@/lib/ai/help-chat-provider";
import { clp } from "../comercial/deal-common";
import { readChannelContextForTool } from "../presence";
import { getOpenDealRoom, getDealRoom, dealRoomChannelName } from "./room";
import { loadDealCard } from "./ficha";

const pt = (text: string) => ({ type: "plain_text", text: text.slice(0, 75), emoji: true });

/**
 * Resume la conversación de la sala en 2-3 líneas con el LLM de la plataforma.
 * `won` → recap celebratorio; `lost` → post-mortem (qué pasó, aprendizaje).
 * Si no hay proveedor o conversación, cae a un texto neutro.
 */
async function summarizeRoom(tenantId: string, channelId: string, dealTitle: string, kind: "won" | "lost"): Promise<string> {
  const ctx = await readChannelContextForTool(tenantId, { currentChannelId: channelId, limit: 40 }).catch(() => null);
  const convo = ctx?.ok && ctx.data?.messages?.length
    ? ctx.data.messages.map((m) => `${m.author}: ${m.text}`).join("\n").slice(0, 6000)
    : "";
  if (!convo) {
    return kind === "won"
      ? "Negocio cerrado con éxito. Revisa el detalle en OPAI para el traspaso a operaciones."
      : "Negocio cerrado como perdido. Revisa el motivo registrado en OPAI.";
  }

  const aiConfig = await getHelpChatAIConfig(tenantId).catch(() => null);
  if (!aiConfig) {
    return kind === "won"
      ? "Negocio ganado. (Configura un proveedor de IA para el resumen automático.)"
      : "Negocio perdido. (Configura un proveedor de IA para el post-mortem automático.)";
  }

  const instruction =
    kind === "won"
      ? `Escribe un recap BREVE (2-3 líneas, español de Chile) del cierre EXITOSO del negocio "${dealTitle}", a partir de la conversación de su sala. Menciona lo clave que llevó a ganar. Tono positivo, sin viñetas.`
      : `Escribe un mini POST-MORTEM BREVE (2-3 líneas, español de Chile) del negocio "${dealTitle}" que se PERDIÓ, a partir de la conversación de su sala: qué pasó y el motivo. Tono objetivo y accionable, sin viñetas.`;

  try {
    const res = await createCompletion(
      { ...aiConfig },
      {
        messages: [
          { role: "system", content: "Eres OPAI, asistente comercial. Respondes solo con el texto pedido, sin preámbulos." },
          { role: "user", content: `${instruction}\n\nConversación de la sala:\n${convo}` },
        ],
        tools: [],
        temperature: 0.3,
        maxTokens: 220,
      },
    );
    return (res.text || "").trim() || (kind === "won" ? "Negocio ganado." : "Negocio perdido.");
  } catch (e) {
    console.error("[slack] summarizeRoom falló:", e);
    return kind === "won" ? "Negocio ganado. 🎉" : "Negocio perdido.";
  }
}

function closeCardBlocks(kind: "won" | "lost", dealId: string, title: string, summary: string, montoTxt?: string): unknown[] {
  const base = getCanonicalSiteUrl();
  const header = kind === "won" ? `🎉 Negocio ganado: ${title}` : `🥀 Negocio perdido: ${title}`;
  const blocks: unknown[] = [
    { type: "header", text: pt(header.slice(0, 150)) },
  ];
  if (montoTxt) blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: `💰 ${montoTxt}` }] });
  blocks.push({ type: "section", text: { type: "mrkdwn", text: summary.slice(0, 2900) } });

  const elements: unknown[] = [
    { type: "button", action_id: "dealroom_open", url: `${base}/crm/deals/${dealId}`, text: pt("Abrir en OPAI") },
  ];
  if (kind === "won") {
    elements.push({ type: "button", action_id: "dealroom_handoff", value: dealId, style: "primary", text: pt("🚀 Convertir en canal de operación") });
  }
  elements.push({ type: "button", action_id: "dealroom_archive", value: dealId, style: "danger", text: pt("🗄 Archivar") });
  blocks.push({ type: "actions", block_id: `dealroom_close_${dealId}`, elements });
  return blocks;
}

/**
 * Publica la tarjeta de cierre (celebración/post-mortem + botones) en la sala.
 * Llamada desde dispatch cuando un evento deal_won/deal_lost cae en una sala.
 */
export async function postDealClosedCard(tenantId: string, dealId: string, kind: "won" | "lost"): Promise<void> {
  const room = await getOpenDealRoom(tenantId, dealId);
  if (!room) return;
  const ws = await getWorkspaceForTenant(tenantId);
  if (!ws) return;

  const card = await loadDealCard(tenantId, dealId);
  const title = card?.title ?? "Negocio";
  const montoTxt = card?.amount ? clp(card.amount) : undefined;
  const summary = await summarizeRoom(tenantId, room.slackChannelId, title, kind);

  const blocks = closeCardBlocks(kind, dealId, title, summary, montoTxt);
  await slackPostMessage(ws.botToken, {
    channel: room.slackChannelId,
    text: kind === "won" ? `🎉 Negocio ganado: ${title}` : `🥀 Negocio perdido: ${title}`,
    blocks,
  }).catch((e) => console.error("[slack] postDealClosedCard falló:", e));
}

/* ── Acciones de cierre (botones de la tarjeta) ── */

export interface CloseActionResult {
  ok: boolean;
  message: string;
}

/** Archiva la sala: conversations.archive + status ARCHIVED (map conservado). */
export async function archiveDealRoom(tenantId: string, dealId: string, actorAdminId: string): Promise<CloseActionResult> {
  const room = await getDealRoom(tenantId, dealId);
  if (!room) return { ok: false, message: "Esta sala ya no existe." };
  if (room.status === "ARCHIVED") return { ok: true, message: "🗄 La sala ya estaba archivada." };
  const ws = await getWorkspaceForTenant(tenantId);
  if (!ws) return { ok: false, message: "Slack no está conectado." };

  const r = await slackArchiveConversation(ws.botToken, room.slackChannelId);
  if (!r.ok) return { ok: false, message: "No pude archivar el canal en Slack." };

  await prisma.crmDealSlackRoom.updateMany({ where: { tenantId, dealId }, data: { status: "ARCHIVED" } });
  await logAudit({ action: "UPDATE", entity: "CrmDealSlackRoom", entityId: dealId, tenantId, userId: actorAdminId, details: { status: "ARCHIVED", via: "slack" } });
  return { ok: true, message: "🗄 Sala archivada. El historial queda guardado en OPAI." };
}

/**
 * Handoff comercial→ops: renombra la sala a `op-{slug}` y ofrece el link a la
 * operación (onboarding/instalación) creada al ganar. La sala sigue OPEN, ahora
 * como canal de operación.
 */
export async function handoffDealRoomToOps(tenantId: string, dealId: string, actorAdminId: string): Promise<CloseActionResult> {
  const room = await getOpenDealRoom(tenantId, dealId);
  if (!room) return { ok: false, message: "Esta sala no está abierta." };
  const ws = await getWorkspaceForTenant(tenantId);
  if (!ws) return { ok: false, message: "Slack no está conectado." };

  const deal = await prisma.crmDeal.findFirst({
    where: { id: dealId, tenantId },
    select: { title: true, account: { select: { name: true } } },
  });
  const opName = dealRoomChannelName(deal?.account.name ?? "operacion", deal?.title).replace(/^neg-/, "op-").slice(0, 80);

  let newName = room.slackChannelName;
  try {
    const renamed = await slackRenameConversation(ws.botToken, room.slackChannelId, opName);
    newName = renamed.name;
    await prisma.crmDealSlackRoom.updateMany({ where: { tenantId, dealId }, data: { slackChannelName: newName } });
  } catch (e) {
    console.error("[slack] handoff renombrar falló:", e);
    // No es fatal: seguimos con el mensaje de traspaso aunque el nombre no cambie.
  }

  // Link a la operación creada al ganar (onboarding), si existe.
  const base = getCanonicalSiteUrl();
  const onboarding = await prisma.clientOnboarding
    .findUnique({ where: { dealId }, select: { id: true, accountId: true } })
    .catch(() => null);
  const opsLink = onboarding
    ? `${base}/crm/accounts/${onboarding.accountId}/onboarding/${onboarding.id}`
    : `${base}/crm/deals/${dealId}`;

  await slackPostMessage(ws.botToken, {
    channel: room.slackChannelId,
    text: "🚀 Sala convertida en canal de operación.",
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: `🚀 *Traspaso a operaciones.* Esta sala pasa a ser el canal de operación del cliente.` } },
      { type: "actions", elements: [{ type: "button", action_id: "dealroom_open", url: opsLink, text: pt(onboarding ? "Abrir la operación" : "Abrir en OPAI") }] },
    ],
  }).catch((e) => console.error("[slack] handoff mensaje falló:", e));

  await logAudit({ action: "UPDATE", entity: "CrmDealSlackRoom", entityId: dealId, tenantId, userId: actorAdminId, details: { handoff: "ops", channelName: newName, via: "slack" } });
  return { ok: true, message: `🚀 Sala convertida en canal de operación (#${newName}).` };
}
