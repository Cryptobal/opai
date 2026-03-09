/**
 * Chat server-side utilities
 * Pusher client singleton + helper functions
 */

import Pusher from "pusher";
import { prisma } from "@/lib/prisma";

// ── Pusher Server Singleton ──

let pusherInstance: Pusher | null = null;

function getPusher(): Pusher {
  if (pusherInstance) return pusherInstance;

  const appId = process.env.PUSHER_APP_ID;
  const key = process.env.PUSHER_KEY;
  const secret = process.env.PUSHER_SECRET;
  const cluster = process.env.PUSHER_CLUSTER;

  if (!appId || !key || !secret || !cluster) {
    throw new Error(
      "PUSHER_APP_ID, PUSHER_KEY, PUSHER_SECRET y PUSHER_CLUSTER son requeridos"
    );
  }

  pusherInstance = new Pusher({
    appId,
    key,
    secret,
    cluster,
    useTLS: true,
  });

  return pusherInstance;
}

// ── Public Server Instance (for non-chat events like monitoring alerts) ──

export function getPusherServer(): Pusher {
  return getPusher();
}

// ── Channel Naming ──

export function getPresenceChannelName(channelId: string): string {
  return `presence-chat-${channelId}`;
}

// ── Trigger Events ──

export async function triggerChatEvent(
  channelId: string,
  event: string,
  data: Record<string, unknown>
): Promise<void> {
  const pusher = getPusher();
  const channelName = getPresenceChannelName(channelId);
  await pusher.trigger(channelName, event, data);
}

// ── Pusher Auth ──

export function authorizePusherChannel(
  socketId: string,
  channelName: string,
  userData: { id: string; name: string; type: string }
) {
  const pusher = getPusher();
  return pusher.authorizeChannel(socketId, channelName, {
    user_id: `${userData.type}:${userData.id}`,
    user_info: {
      name: userData.name,
      type: userData.type,
    },
  });
}

// ── Helper: extract sender ID from message ──

export function getSenderId(message: {
  senderType: string;
  senderAdminId: string | null;
  senderGuardiaId: string | null;
  senderContactId: string | null;
}): string {
  switch (message.senderType) {
    case "ADMIN":
      return message.senderAdminId ?? "";
    case "GUARD":
      return message.senderGuardiaId ?? "";
    case "CLIENT":
      return message.senderContactId ?? "";
    default:
      return "system";
  }
}

// ── Helper: truncate preview ──

export function truncatePreview(content: string, maxLen = 100): string {
  if (content.length <= maxLen) return content;
  return content.slice(0, maxLen) + "…";
}

// ── Batch unread counts ──

/**
 * Compute unread counts for multiple channels in a single SQL query.
 * Replaces the N+1 pattern of individual COUNT queries per channel.
 *
 * @param excludeThreadReplies If true, only count main messages (thread_root_id IS NULL).
 */
export async function batchUnreadCounts(
  channelIds: string[],
  readerType: string,
  readerId: string,
  excludeThreadReplies = false,
): Promise<Map<string, number>> {
  if (channelIds.length === 0) return new Map();

  const rows = excludeThreadReplies
    ? await prisma.$queryRaw<{ channel_id: string; unread_count: bigint }[]>`
        SELECT m.channel_id, COUNT(*) AS unread_count
        FROM chat.messages m
        LEFT JOIN chat.read_cursors rc
          ON rc.channel_id = m.channel_id
          AND rc.reader_type = ${readerType}::"ChatSenderType"
          AND rc.reader_id = ${readerId}
        WHERE m.channel_id = ANY(${channelIds}::uuid[])
          AND m.deleted_at IS NULL
          AND m.thread_root_id IS NULL
          AND (rc.last_read_at IS NULL OR m.created_at > rc.last_read_at)
        GROUP BY m.channel_id
      `
    : await prisma.$queryRaw<{ channel_id: string; unread_count: bigint }[]>`
        SELECT m.channel_id, COUNT(*) AS unread_count
        FROM chat.messages m
        LEFT JOIN chat.read_cursors rc
          ON rc.channel_id = m.channel_id
          AND rc.reader_type = ${readerType}::"ChatSenderType"
          AND rc.reader_id = ${readerId}
        WHERE m.channel_id = ANY(${channelIds}::uuid[])
          AND m.deleted_at IS NULL
          AND (rc.last_read_at IS NULL OR m.created_at > rc.last_read_at)
        GROUP BY m.channel_id
      `;

  return new Map(rows.map((r) => [r.channel_id, Number(r.unread_count)]));
}
