/**
 * Chat system TypeScript types
 * Used by both server API routes and client components
 */

import type { ChatSenderType } from "@prisma/client";

export type { ChatSenderType };

// ── Channel ──

export type ChatChannelData = {
  id: string;
  tenantId: string;
  channelType: "INSTALLATION" | "GROUP" | "DIRECT" | "EXTERNAL";
  installationId: string | null;
  subType: "reportes" | "interno" | null;
  groupId: string | null;
  name: string;
  isActive: boolean;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
  installation?: {
    id: string;
    name: string;
    account: { id: string; name: string } | null;
  } | null;
  group?: {
    id: string;
    color: string;
    slug: string;
  } | null;
  dmParticipant?: {
    id: string;
    name: string;
    email: string;
    image: string | null;
  } | null;
  unreadCount?: number;
  isArchivedByMe?: boolean;
  account?: { id: string; name: string; status: string } | null;
};

// ── Message ──

export type ChatAttachment = {
  id: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
  storageKey?: string;
};

export type ChatReactionSummary = {
  emoji: string;
  count: number;
  senders: { id: string; name: string; type: ChatSenderType }[];
};

export type ChatMessageData = {
  id: string;
  channelId: string;
  senderType: ChatSenderType;
  senderId: string;
  senderName: string;
  senderAvatar: string | null;
  content: string;
  contentHtml: string | null;
  replyTo: {
    id: string;
    senderName: string;
    content: string;
  } | null;
  threadRootId: string | null;
  replyCount: number;
  lastReplyAt: string | null;
  attachments: ChatAttachment[] | null;
  reactions: ChatReactionSummary[];
  systemEventType: string | null;
  systemEventData: Record<string, unknown> | null;
  isEdited: boolean;
  createdAt: string;
};

// ── Pusher Events ──

export type PusherNewMessageEvent = {
  id: string;
  channelId: string;
  senderType: ChatSenderType;
  senderId: string;
  senderName: string;
  senderAvatar: string | null;
  content: string;
  contentHtml: string | null;
  replyTo: { id: string; senderName: string; content: string } | null;
  threadRootId: string | null;
  replyCount: number;
  lastReplyAt: string | null;
  attachments: ChatAttachment[] | null;
  systemEventType: string | null;
  createdAt: string;
};

export type PusherMessageEditedEvent = {
  id: string;
  content: string;
  editedAt: string;
};

export type PusherMessageDeletedEvent = {
  id: string;
};

export type PusherMessagesClearedEvent = {
  clearedBy: string;
  count: number;
};

export type PusherReactionEvent = {
  messageId: string;
  emoji: string;
  senderId: string;
  senderName: string;
  senderType: ChatSenderType;
};

export type PusherTypingEvent = {
  userId: string;
  userName: string;
  userType: ChatSenderType;
};

// ── API Request/Response ──

export type SendMessagePayload = {
  content: string;
  replyToId?: string;
  attachments?: ChatAttachment[];
};

export type MessagesResponse = {
  success: boolean;
  data: ChatMessageData[];
  meta: {
    hasMore: boolean;
    nextCursor: string | null;
  };
};

export type ChannelsResponse = {
  success: boolean;
  data: ChatChannelData[];
  meta: {
    total: number;
  };
};

export type UnreadCountsResponse = {
  success: boolean;
  data: {
    total: number;
    channels: Record<string, number>;
  };
};
