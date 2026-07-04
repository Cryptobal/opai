/**
 * Channel Expert (Fase 16, B4) — el bot responde en una sala de negocio con
 * DOBLE contexto: la conversación reciente del canal (B8) + la ficha del deal
 * (datos CRM en vivo). "¿En qué quedamos con Etex?" se responde mezclando ambos.
 *
 * Se materializa como un `contextHint` (system message) que se inyecta al runner.
 * Respeta SIEMPRE la lista de canales excluidos de la gobernanza.
 */

import { clp } from "../comercial/deal-common";
import { isChannelExcluded } from "../channel-exclusions";
import { readChannelContextForTool } from "../presence";
import { loadDealCard } from "./ficha";
import { getDealRoomByChannel } from "./room";

/**
 * Devuelve el hint de doble contexto si `channelId` es una sala de negocio OPEN
 * (y no está excluido); si no, null (el llamador cae a su hint por defecto).
 */
export async function buildDealRoomContextHint(tenantId: string, channelId: string): Promise<string | null> {
  if (!channelId) return null;
  const room = await getDealRoomByChannel(tenantId, channelId);
  if (!room || room.status !== "OPEN") return null;
  // Gobernanza: si la sala está excluida de lectura, no la usamos como contexto.
  if (await isChannelExcluded(tenantId, channelId)) return null;

  const card = await loadDealCard(tenantId, room.dealId);
  if (!card) return null;

  const fichaLines = [
    `- Cliente: ${card.accountName}`,
    `- Monto: ${card.amount ? clp(card.amount) : "—"}`,
    `- Etapa: ${card.stageName} (estado: ${card.status})`,
    `- Cotización activa: ${card.quoteLabel ?? "—"}`,
    `- Próxima tarea: ${card.nextTask ?? "—"}`,
    `- Owner: ${card.ownerName ?? "—"}`,
  ].join("\n");

  // Conversación reciente de la sala (B8): reusa el lector con resolución de
  // nombres; sin persistir nada. Best-effort.
  let convo = "";
  const ctx = await readChannelContextForTool(tenantId, { currentChannelId: channelId, limit: 30 }).catch(() => null);
  if (ctx?.ok && ctx.data?.messages?.length) {
    convo = ctx.data.messages
      .slice(-30)
      .map((m) => `${m.author}: ${m.text}`)
      .join("\n")
      .slice(0, 6000);
  }

  return [
    `Estás respondiendo DENTRO de la sala de Slack del negocio "${card.title}" (${card.accountName}).`,
    ``,
    `FICHA DEL NEGOCIO (datos CRM en vivo):`,
    fichaLines,
    ``,
    convo ? `CONVERSACIÓN RECIENTE DE LA SALA (más nueva al final):\n${convo}` : `(La sala no tiene conversación reciente legible.)`,
    ``,
    `Cuando te pregunten "¿en qué quedamos?", el estado del negocio o similar, MEZCLA la conversación de la sala con los datos del CRM. Usa las tools (deal_id: ${room.dealId}) si necesitas datos más frescos o profundos.`,
  ].join("\n");
}
