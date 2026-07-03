/**
 * Puente entrante: mensajes de un canal de Slack → chat de OPAI (Fase 4).
 *
 * Se cablea desde el flujo de eventos (Fase 2): los `message` en canales
 * `channel`/`group` puenteados entran acá; los `im` siguen yendo al bot.
 * Orden de filtros barato→caro para que los canales sin puente cuesten ~cero.
 */

import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getWorkspaceForTenant } from "./workspace";
import { slackGetUserProfile } from "./api";
import { triggerChatEvent, truncatePreview } from "@/lib/chat";
import type { SlackBotEvent } from "./bot";

type LinkRow = { id: string; chatChannelId: string };

const LINK_TTL_MS = 60 * 1000;
const linkCache = new Map<string, { value: LinkRow | null; expiresAt: number }>();

async function resolveLinkBySlack(tenantId: string, slackChannelId: string): Promise<LinkRow | null> {
  const cached = linkCache.get(slackChannelId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const link = await prisma.slackChannelLink.findFirst({
    where: { tenantId, slackChannelId, enabled: true },
    select: { id: true, chatChannelId: true },
  });
  linkCache.set(slackChannelId, { value: link, expiresAt: Date.now() + LINK_TTL_MS });
  return link;
}

/** Normaliza el texto de Slack: entidades HTML + links <url|texto>. */
function fromSlackText(text: string): string {
  return text
    .replace(/<@[A-Z0-9]+>/g, "@usuario")
    .replace(/<([^|>]+)\|([^>]+)>/g, "$2")
    .replace(/<(https?:[^>]+)>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export async function handleInboundSlackMessage(
  teamId: string,
  tenantId: string,
  workspaceId: string,
  event: SlackBotEvent,
): Promise<void> {
  // (1) Anti-loop / barato: ignora bots y subtypes (ediciones, joins, message_changed…).
  if (event.bot_id || event.subtype) return;
  if (!event.channel || !event.ts || !event.user) return;

  // (2) Canal sin puente → return ANTES de cualquier query/API cara (cache 60s).
  const link = await resolveLinkBySlack(tenantId, event.channel);
  if (!link) return;

  // (3) Recién ahora resolvemos token e identidad.
  const ws = await getWorkspaceForTenant(tenantId);
  if (!ws) return;

  let senderType: "ADMIN" | "SLACK";
  let senderAdminId: string | null = null;
  let senderName: string;
  let senderAvatar: string | null = null;

  const userLink = await prisma.slackUserLink.findFirst({
    where: { workspaceId, slackUserId: event.user },
    select: { adminId: true },
  });
  if (userLink) {
    const admin = await prisma.admin.findUnique({
      where: { id: userLink.adminId },
      select: { id: true, name: true },
    });
    senderType = "ADMIN";
    senderAdminId = admin?.id ?? null;
    senderName = admin?.name ?? "Usuario";
  } else {
    const profile = await slackGetUserProfile(ws.botToken, event.user, teamId);
    senderType = "SLACK";
    senderName = profile?.displayName ?? "Usuario de Slack";
    senderAvatar = profile?.avatarUrl ?? null;
  }

  // Hilos: respuesta en hilo de Slack → threadRootId del root en OPAI.
  let threadRootId: string | null = null;
  if (event.thread_ts && event.thread_ts !== event.ts) {
    const rootMap = await prisma.slackBridgeMessageMap.findUnique({
      where: { slackChannelId_slackTs: { slackChannelId: event.channel, slackTs: event.thread_ts } },
      select: { chatMessageId: true },
    });
    threadRootId = rootMap?.chatMessageId ?? null;
  }

  let content = fromSlackText(event.text ?? "");
  for (const f of event.files ?? []) {
    if (f?.permalink) content += `\n📎 (archivo en Slack: ${f.permalink})`;
  }
  if (!content.trim()) content = "(mensaje sin texto)";

  try {
    const message = await prisma.$transaction(async (tx) => {
      const msg = await tx.chatMessage.create({
        data: {
          tenantId,
          channelId: link.chatChannelId,
          senderType,
          senderAdminId,
          senderName,
          senderAvatar,
          content,
          threadRootId,
        },
      });
      if (threadRootId) {
        await tx.chatMessage.update({
          where: { id: threadRootId },
          data: { replyCount: { increment: 1 }, lastReplyAt: msg.createdAt },
        });
      }
      await tx.chatChannel.update({
        where: { id: link.chatChannelId },
        data: {
          lastMessageAt: msg.createdAt,
          lastMessagePreview: truncatePreview(content, 100),
          messageCount: { increment: 1 },
        },
      });
      // Dedupe: unique (slackChannelId, slackTs). Reintento de Slack → P2002 → rollback.
      await tx.slackBridgeMessageMap.create({
        data: {
          tenantId,
          linkId: link.id,
          chatMessageId: msg.id,
          slackChannelId: event.channel!,
          slackTs: event.ts!,
          direction: "IN",
        },
      });
      return msg;
    });

    // Pusher: mismo evento y shape que la ruta admin, para que la UI lo pinte en vivo.
    const responseData = {
      id: message.id,
      channelId: link.chatChannelId,
      senderType,
      senderId: senderAdminId ?? event.user,
      senderName,
      senderAvatar: message.senderAvatar,
      content: message.content,
      contentHtml: null,
      replyTo: null,
      threadRootId: message.threadRootId,
      replyCount: message.replyCount,
      lastReplyAt: message.lastReplyAt?.toISOString() ?? null,
      attachments: null,
      reactions: [],
      mentions: [],
      systemEventType: null,
      systemEventData: null,
      isEdited: false,
      createdAt: message.createdAt.toISOString(),
    };
    const eventName = threadRootId ? "thread-reply" : "new-message";
    await triggerChatEvent(
      link.chatChannelId,
      eventName,
      threadRootId ? { threadRootId, message: responseData } : responseData,
    );
  } catch (err) {
    // Evento duplicado de Slack (reintentos de su lado): abortar en silencio.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return;
    throw err;
  }
}
