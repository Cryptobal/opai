/**
 * Efecto secundario de registrar una interacción sobre un negocio (Fase 4).
 * Espeja la interacción en la sala, refresca la ficha viva y — si hay IA — postea
 * un insight breve con la PRÓXIMA MEJOR ACCIÓN (patrón de lifecycle.ts: ficha +
 * últimas interacciones + estado de cotización). Anti-spam: máx 1 cada ~6h por
 * negocio. Todo best-effort: no rompe el registro de la nota.
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { interactionLabel } from "@/lib/crm/interaction-types";
import { recentInteractions, agoLabel } from "@/lib/crm/interaction-history";
import { getHelpChatAIConfig, createCompletion } from "@/lib/ai/help-chat-provider";
import { clp } from "../comercial/deal-common";
import { getWorkspaceForTenant } from "../workspace";
import { slackPostMessage } from "../api";
import { getOpenDealRoom, mirrorDealNoteToRoom, refreshDealRoomFicha } from "./room";
import { loadDealCard } from "./ficha";

const INSIGHT_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6h
const lastInsightAt = new Map<string, number>();

export async function onDealInteractionLogged(
  tenantId: string,
  dealId: string,
  adminId: string,
  interactionType: string,
  summary: string,
): Promise<void> {
  const room = await getOpenDealRoom(tenantId, dealId);
  if (!room) return; // sin sala OPEN: no hay dónde espejar ni sobre qué dar insight
  const admin = await prisma.admin.findFirst({ where: { id: adminId, tenantId }, select: { name: true } }).catch(() => null);
  const authorName = admin?.name ?? "Alguien";
  await mirrorDealNoteToRoom(tenantId, dealId, `${interactionLabel(interactionType)}: ${summary}`, authorName).catch(() => {});
  await refreshDealRoomFicha(tenantId, dealId).catch(() => {});
  await postNextActionInsight(tenantId, dealId, room.slackChannelId).catch((e) => console.error("[slack] insight interacción falló:", e));
}

/** Insight con la próxima mejor acción. Silencioso si no hay IA o en cooldown. */
async function postNextActionInsight(tenantId: string, dealId: string, channelId: string): Promise<void> {
  const key = `${tenantId}:${dealId}`;
  if (Date.now() - (lastInsightAt.get(key) ?? 0) < INSIGHT_COOLDOWN_MS) return;

  const aiConfig = await getHelpChatAIConfig(tenantId).catch(() => null);
  if (!aiConfig) return; // sin proveedor de IA → silencioso

  const [card, recientes] = await Promise.all([
    loadDealCard(tenantId, dealId),
    recentInteractions(tenantId, "deal", dealId, 5),
  ]);
  if (!card) return;

  const ficha = [
    `Cliente: ${card.accountName}`,
    `Monto: ${card.amount ? clp(card.amount) : "—"}`,
    `Etapa: ${card.stageName} (${card.status})`,
    `Cotización activa: ${card.quoteLabel ?? "—"}`,
    `Próxima tarea: ${card.nextTask ?? "—"}`,
  ].join("\n");
  const historial = recientes.length
    ? recientes.map((i) => `- ${interactionLabel(i.type)} (${agoLabel(i.at)}): ${i.content.replace(/\n+/g, " ").slice(0, 160)}`).join("\n")
    : "(sin interacciones previas)";

  let text = "";
  try {
    const res = await createCompletion(
      { ...aiConfig },
      {
        messages: [
          { role: "system", content: "Eres OPAI, copiloto comercial. Respondes SOLO con 1-2 líneas en español de Chile: la próxima mejor acción concreta para avanzar el negocio. Sin preámbulos ni viñetas." },
          { role: "user", content: `Negocio "${card.title}".\n\nFICHA:\n${ficha}\n\nÚLTIMAS INTERACCIONES:\n${historial}\n\n¿Cuál es la PRÓXIMA MEJOR ACCIÓN para avanzar este negocio?` },
        ],
        tools: [],
        temperature: 0.3,
        maxTokens: 160,
      },
    );
    text = (res.text || "").trim();
  } catch (e) {
    console.error("[slack] postNextActionInsight createCompletion falló:", e);
    return;
  }
  if (!text) return;

  const ws = await getWorkspaceForTenant(tenantId);
  if (!ws) return;
  await slackPostMessage(ws.botToken, {
    channel: channelId,
    text: `💡 *Próxima acción:* ${text}`.slice(0, 3000),
  }).catch((e) => console.error("[slack] postNextActionInsight postMessage falló:", e));
  lastInsightAt.set(key, Date.now());
}
