/**
 * Reacciones cruzadas Slack → OPAI (Fase 7.1).
 *
 * Un 👍/✅ en un mensaje puenteado de Slack aparece en el chat de OPAI con la
 * identidad del Admin vinculado. Filtro barato primero (mensaje puenteado +
 * no-bot), luego identidad. No vinculados se omiten en v1. Anti-loop: las
 * reacciones que el propio bot pone (espejo saliente) llegan con
 * `event.user === botUserId` y se descartan.
 */

import { prisma } from "@/lib/prisma";
import { triggerChatEvent } from "@/lib/chat";
import { getWorkspaceForTenant } from "./workspace";
import { resolveLinkedAdmin } from "./user-link";
import { slackNameToUnicode } from "./emoji";

export interface SlackReactionEvent {
  user?: string;
  reaction?: string;
  item?: { type?: string; channel?: string; ts?: string };
}

/** Procesa reaction_added / reaction_removed de Slack sobre un mensaje puenteado. */
export async function handleSlackReaction(
  tenantId: string,
  event: SlackReactionEvent,
  added: boolean,
): Promise<void> {
  const slackUserId = event.user;
  const channel = event.item?.channel;
  const ts = event.item?.ts;
  const reaction = event.reaction;
  if (!slackUserId || !channel || !ts || !reaction || event.item?.type !== "message") return;

  const workspace = await getWorkspaceForTenant(tenantId);
  if (!workspace) return;
  if (slackUserId === workspace.botUserId) return; // espejo saliente del bot → ignorar

  // Filtro barato: ¿es un mensaje puenteado? Si no, no hay nada que reflejar.
  const map = await prisma.slackBridgeMessageMap.findFirst({
    where: { tenantId, slackChannelId: channel, slackTs: ts },
    select: { chatMessageId: true },
  });
  if (!map) return;

  const emoji = slackNameToUnicode(reaction);
  if (!emoji) {
    console.debug(`[slack] reacción sin mapeo unicode, omitida: ${reaction}`);
    return;
  }

  // Identidad: sólo reflejamos reacciones de usuarios vinculados (v1).
  const linked = await resolveLinkedAdmin(workspace, slackUserId);
  if (!linked) return;

  const [admin, msg] = await Promise.all([
    prisma.admin.findFirst({ where: { id: linked.adminId, tenantId }, select: { name: true, email: true } }),
    prisma.chatMessage.findFirst({ where: { id: map.chatMessageId, tenantId }, select: { channelId: true } }),
  ]);
  if (!msg) return;
  const senderName = admin?.name ?? admin?.email ?? "OPAI";

  if (added) {
    try {
      await prisma.chatMessageReaction.create({
        data: { tenantId, messageId: map.chatMessageId, senderType: "ADMIN", senderId: linked.adminId, senderName, emoji },
      });
    } catch (err) {
      if ((err as { code?: string }).code === "P2002") return; // ya existe → sin evento duplicado
      throw err;
    }
  } else {
    const del = await prisma.chatMessageReaction.deleteMany({
      where: { messageId: map.chatMessageId, senderId: linked.adminId, emoji },
    });
    if (del.count === 0) return; // no existía → sin evento
  }

  // Mismo evento Pusher que emite la UI web, para que el realtime sea idéntico.
  await triggerChatEvent(msg.channelId, added ? "reaction-added" : "reaction-removed", {
    messageId: map.chatMessageId,
    emoji,
    senderId: linked.adminId,
    senderName,
    senderType: "ADMIN",
  }).catch((e) => console.error("[slack] pusher reacción falló:", e));
}
