import type { ChatMessageData } from "@/lib/chat-types";

export type ChatChannelSummaryPatch = {
  channelId: string;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  messageCount?: number;
};

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
