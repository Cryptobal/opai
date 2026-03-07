/**
 * Chat server-side utilities
 * Pusher client singleton + helper functions
 */

import Pusher from "pusher";

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
