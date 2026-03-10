/**
 * System chat message utilities.
 *
 * Helpers for sending automated system messages to chat channels
 * and looking up well-known channels (e.g. "Operaciones").
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { triggerChatEvent, truncatePreview } from "@/lib/chat";

/* ------------------------------------------------------------------ */
/*  Lookup: Operaciones channel                                        */
/* ------------------------------------------------------------------ */

/**
 * Find the "Operaciones" group chat channel for a tenant.
 * Lookup chain: AdminGroup(slug="operaciones") → ChatChannel(type=GROUP, groupId).
 * Returns null if no matching group/channel exists.
 */
export async function getOpsChannelId(
  tenantId: string,
): Promise<string | null> {
  const group = await prisma.adminGroup.findFirst({
    where: { tenantId, slug: "operaciones", isActive: true },
    select: { id: true },
  });
  if (!group) return null;

  const channel = await prisma.chatChannel.findFirst({
    where: {
      tenantId,
      channelType: "GROUP",
      groupId: group.id,
      isActive: true,
    },
    select: { id: true },
  });
  return channel?.id ?? null;
}

/* ------------------------------------------------------------------ */
/*  Send system message                                                */
/* ------------------------------------------------------------------ */

interface SystemMessageParams {
  tenantId: string;
  channelId: string;
  content: string;
  systemEventType: string;
  systemEventData?: Record<string, unknown>;
}

/**
 * Create a SYSTEM chat message, update channel metadata, and trigger
 * the Pusher real-time event so connected clients see the message
 * immediately.
 */
export async function sendSystemChatMessage(
  params: SystemMessageParams,
): Promise<void> {
  const { tenantId, channelId, content, systemEventType, systemEventData } =
    params;

  const message = await prisma.chatMessage.create({
    data: {
      tenantId,
      channelId,
      senderType: "SYSTEM",
      senderName: "Sistema OPAI",
      content,
      systemEventType,
      systemEventData: (systemEventData as Prisma.InputJsonValue) ?? undefined,
    },
  });

  // Update channel last message metadata
  await prisma.chatChannel.update({
    where: { id: channelId },
    data: {
      lastMessageAt: message.createdAt,
      lastMessagePreview: truncatePreview(content),
      messageCount: { increment: 1 },
    },
  });

  // Trigger Pusher event for real-time delivery
  await triggerChatEvent(channelId, "new-message", {
    id: message.id,
    channelId,
    senderType: "SYSTEM",
    senderName: "Sistema OPAI",
    content,
    systemEventType,
    systemEventData: systemEventData ?? null,
    createdAt: message.createdAt.toISOString(),
  });
}
