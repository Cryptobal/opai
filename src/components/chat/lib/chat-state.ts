import type { ChatMessageData, ChatSenderType } from "@/lib/chat-types";

export type ChatChannelSummaryPatch = {
  channelId: string;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  messageCount?: number;
};

/**
 * Un evento de reacción recibido por realtime (Pusher), sea desde la web o
 * desde el puente de Slack. Se aplica sobre la lista de mensajes efectivamente
 * renderizada (apiMessages), no sobre el estado interno del hook — que solo
 * contiene los mensajes llegados por `new-message` en la sesión actual.
 */
export type ReactionEvent = {
  action: "add" | "remove";
  messageId: string;
  emoji: string;
  sender: { id: string; name: string; type: ChatSenderType };
};

/**
 * Aplica un evento de reacción de forma idempotente:
 * - add: si el sender ya reaccionó con ese emoji, no hace nada (evita duplicar
 *   contra la actualización optimista propia o un evento repetido).
 * - remove: si el sender no está, es un no-op.
 */
export function applyReactionEvent(
  messages: ChatMessageData[],
  event: ReactionEvent,
): ChatMessageData[] {
  return messages.map((m) => {
    if (m.id !== event.messageId) return m;

    if (event.action === "add") {
      const existing = m.reactions.find((r) => r.emoji === event.emoji);
      if (existing) {
        if (existing.senders.some((s) => s.id === event.sender.id)) return m;
        return {
          ...m,
          reactions: m.reactions.map((r) =>
            r.emoji === event.emoji
              ? { ...r, count: r.count + 1, senders: [...r.senders, event.sender] }
              : r,
          ),
        };
      }
      return {
        ...m,
        reactions: [...m.reactions, { emoji: event.emoji, count: 1, senders: [event.sender] }],
      };
    }

    // remove
    const reactions = m.reactions
      .map((r) => {
        if (r.emoji !== event.emoji) return r;
        const senders = r.senders.filter((s) => s.id !== event.sender.id);
        return senders.length > 0 ? { ...r, count: senders.length, senders } : null;
      })
      .filter(Boolean) as ChatMessageData["reactions"];
    return { ...m, reactions };
  });
}

export function reconcileRealtimeMessages(
  apiMessages: ChatMessageData[],
  realtimeMessages: ChatMessageData[],
  deletedMessageIds: ReadonlySet<string>,
): ChatMessageData[] {
  const existingIds = new Set(apiMessages.map((message) => message.id));
  const visibleApiMessages = apiMessages.filter((message) => !deletedMessageIds.has(message.id));
  const newMessages = realtimeMessages.filter(
    (message) => !existingIds.has(message.id) && !deletedMessageIds.has(message.id),
  );
  return [...visibleApiMessages, ...newMessages];
}

export function applyDeletedMessages(
  messages: ChatMessageData[],
  deletedMessageIds: ReadonlySet<string>,
): ChatMessageData[] {
  if (deletedMessageIds.size === 0) return messages;
  return messages.filter((message) => !deletedMessageIds.has(message.id));
}

export function applyChannelSummaryPatch<T extends {
  id: string;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  messageCount?: number;
}>(
  channels: T[],
  patch: ChatChannelSummaryPatch,
): T[] {
  return channels.map((channel) => {
    if (channel.id !== patch.channelId) return channel;
    return {
      ...channel,
      lastMessagePreview: patch.lastMessagePreview,
      lastMessageAt: patch.lastMessageAt,
      ...(patch.messageCount !== undefined ? { messageCount: patch.messageCount } : {}),
    } as T;
  });
}
