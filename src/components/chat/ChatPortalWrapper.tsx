"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/lib/pwa/use-is-mobile";
import { useSwipeGesture } from "./hooks/useSwipeGesture";
import type { ChatMessageData, SendMessagePayload, ChatSenderType } from "@/lib/chat-types";
import { usePusher } from "./hooks/usePusher";
import { clearChatMessageCache, useChatMessages } from "./hooks/useChatMessages";
import { useChatChannel } from "./hooks/useChatChannel";
import { ChatMessageList } from "./ChatMessageList";
import { ChatTypingIndicator } from "./ChatTypingIndicator";
import { ChatInputPortal } from "./ChatInputPortal";
import {
  applyDeletedMessages,
  reconcileRealtimeMessages,
  type ChatChannelSummaryPatch,
} from "./lib/chat-state";

interface ChatPortalWrapperProps {
  /** API base path, e.g. "/api/chat" or "/api/portal/guardia/chat" */
  apiBase: string;
  /** Extra headers for portal auth (guardia-id, tenant-id, etc.) */
  apiHeaders?: Record<string, string>;
  /** Pusher auth endpoint */
  pusherAuthEndpoint: string;
  /** Extra headers sent during Pusher authentication */
  pusherAuthHeaders?: Record<string, string>;
  /** File upload endpoint */
  uploadEndpoint: string;
  /** Display name for optimistic messages */
  senderName: string;
  /** Sender type for optimistic messages (default: "ADMIN") */
  senderType?: ChatSenderType;
  /** Channel ID to display */
  channelId: string;
  /** Channel display name */
  channelName: string;
  /** Optional subtitle shown below channel name */
  channelSubtitle?: string;
  /** Called when back button is pressed */
  onBack?: () => void;
  /** Enable emoji picker (default: true) */
  enableEmoji?: boolean;
  /** Enable file upload (default: true) */
  enableFileUpload?: boolean;
  /** Called when a mutation changes last message preview/count in channel lists */
  onChannelSummaryChanged?: (patch: ChatChannelSummaryPatch) => void;
}

/**
 * Unified chat wrapper for all portal screens.
 * Handles: Pusher connection, message fetching, real-time updates,
 * mark-as-read, scroll, typing indicators, emoji, file upload.
 *
 * Layout: flex column, must be inside a height-constrained parent.
 */
export function ChatPortalWrapper({
  apiBase,
  apiHeaders,
  pusherAuthEndpoint,
  pusherAuthHeaders,
  uploadEndpoint,
  senderName,
  senderType = "ADMIN",
  channelId,
  channelName,
  channelSubtitle,
  onBack,
  enableEmoji = true,
  enableFileUpload = true,
  onChannelSummaryChanged,
}: ChatPortalWrapperProps) {
  const pusher = usePusher(pusherAuthEndpoint, pusherAuthHeaders);

  const {
    messages: apiMessages,
    isLoading,
    mentionDisplayMap,
    hasMore,
    loadMore,
    sendMessage,
    editMessage,
    deleteMessage,
    setMessages: setApiMessages,
  } = useChatMessages(channelId, {
    apiBase,
    headers: apiHeaders,
    senderType,
    senderName,
  });

  const {
    messages: rtMessages,
    members,
    typingUsers,
    deleteMessage: rtDeleteMessage,
    deletedMessageIds,
    editedMessages,
    clearRevision,
    channelSummaryPatch,
  } = useChatChannel(channelId, pusher);

  const [replyTo, setReplyTo] = useState<{
    id: string;
    senderName: string;
    content: string;
  } | null>(null);

  const lastReadMsgRef = useRef<string | null>(null);

  // Merge real-time messages into API messages
  useEffect(() => {
    if (rtMessages.length === 0) return;
    setApiMessages((prev) => {
      const next = reconcileRealtimeMessages(prev, rtMessages, deletedMessageIds);
      return next.length === prev.length && next.every((message, index) => message.id === prev[index]?.id)
        ? prev
        : next;
    });
  }, [rtMessages, deletedMessageIds, setApiMessages]);

  useEffect(() => {
    if (deletedMessageIds.size === 0) return;
    clearChatMessageCache(channelId);
    setApiMessages((prev) => applyDeletedMessages(prev, deletedMessageIds));
  }, [channelId, deletedMessageIds, setApiMessages]);

  useEffect(() => {
    const entries = Object.entries(editedMessages);
    if (entries.length === 0) return;
    setApiMessages((prev) =>
      prev.map((message) => {
        const edit = editedMessages[message.id];
        return edit ? { ...message, content: edit.content, isEdited: true } : message;
      }),
    );
  }, [editedMessages, setApiMessages]);

  useEffect(() => {
    if (clearRevision === 0) return;
    clearChatMessageCache(channelId);
    setApiMessages([]);
  }, [channelId, clearRevision, setApiMessages]);

  useEffect(() => {
    if (!channelSummaryPatch) return;
    onChannelSummaryChanged?.(channelSummaryPatch);
  }, [channelSummaryPatch, onChannelSummaryChanged]);

  // Mark messages as read
  useEffect(() => {
    if (!channelId || apiMessages.length === 0) return;
    const lastMsg = apiMessages[apiMessages.length - 1];
    if (!lastMsg || lastMsg.id === lastReadMsgRef.current) return;
    lastReadMsgRef.current = lastMsg.id;
    fetch(`${apiBase}/channels/${channelId}/read`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...apiHeaders },
      body: JSON.stringify({ lastReadMessageId: lastMsg.id }),
    }).catch(() => {});
  }, [channelId, apiMessages, apiBase, apiHeaders]);

  // Reset on channel change
  useEffect(() => {
    lastReadMsgRef.current = null;
    setReplyTo(null);
  }, [channelId]);

  const handleSend = useCallback(
    async (payload: SendMessagePayload) => {
      await sendMessage(payload);
      setReplyTo(null);
    },
    [sendMessage],
  );

  const handleReply = useCallback((message: ChatMessageData) => {
    setReplyTo({
      id: message.id,
      senderName: message.senderName,
      content: message.content,
    });
  }, []);

  const handleDelete = useCallback(
    async (messageId: string) => {
      const deleted = await deleteMessage(messageId);
      if (deleted) rtDeleteMessage(messageId);
    },
    [deleteMessage, rtDeleteMessage],
  );

  const handleReaction = useCallback(
    (messageId: string, emoji: string) => {
      setApiMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId) return m;
          const reactions = [...m.reactions];
          const existing = reactions.find((r) => r.emoji === emoji);
          if (existing) {
            const alreadyReacted = existing.senders.some(
              (s) => s.id === "current-user",
            );
            if (alreadyReacted) {
              const newSenders = existing.senders.filter(
                (s) => s.id !== "current-user",
              );
              if (newSenders.length === 0) {
                return {
                  ...m,
                  reactions: reactions.filter((r) => r.emoji !== emoji),
                };
              }
              return {
                ...m,
                reactions: reactions.map((r) =>
                  r.emoji === emoji
                    ? { ...r, count: newSenders.length, senders: newSenders }
                    : r,
                ),
              };
            }
            return {
              ...m,
              reactions: reactions.map((r) =>
                r.emoji === emoji
                  ? {
                      ...r,
                      count: r.count + 1,
                      senders: [
                        ...r.senders,
                        {
                          id: "current-user",
                          name: senderName,
                          type: senderType as ChatSenderType,
                        },
                      ],
                    }
                  : r,
              ),
            };
          }
          return {
            ...m,
            reactions: [
              ...reactions,
              {
                emoji,
                count: 1,
                senders: [
                  {
                    id: "current-user",
                    name: senderName,
                    type: senderType as ChatSenderType,
                  },
                ],
              },
            ],
          };
        }),
      );
    },
    [setApiMessages, senderName, senderType],
  );

  const onlineCount = members.length;
  const isMobile = useIsMobile();

  const swipeDown = useSwipeGesture({
    onSwipeDown: () => onBack?.(),
    hapticOnComplete: true,
    mobileOnly: true,
  });
  const swipeRight = useSwipeGesture({
    onSwipeRight: () => onBack?.(),
    followFinger: true,
    hapticOnComplete: true,
    mobileOnly: true,
  });

  return (
    <div
      className={cn(
        "flex flex-col h-full overflow-hidden opai-chat-mobile-shell opai-ios-surface-sheet-side",
        swipeRight.translateX != null ? "" : "transition-transform duration-[250ms] ease-out"
      )}
      style={
        swipeRight.translateX != null && swipeRight.translateX > 0
          ? { transform: `translateX(${swipeRight.translateX}px)` }
          : undefined
      }
      {...(onBack ? { onTouchStart: swipeRight.onTouchStart, onTouchMove: swipeRight.onTouchMove, onTouchEnd: swipeRight.onTouchEnd } : {})}
    >
      {/* Header — en móvil: barra para arrastrar hacia abajo + botón X */}
      <div
        className="shrink-0 flex flex-col border-b border-[rgba(255,255,255,0.06)] bg-[#0d1220] opai-chat-mobile-topbar opai-ios-surface-sheet-top"
        {...(isMobile && onBack ? swipeDown : {})}
      >
        {isMobile && onBack && (
          <div className="flex justify-center pt-2 pb-2">
            <div className="w-12 h-1.5 rounded-full bg-[rgba(255,255,255,0.25)]" />
          </div>
        )}
        <div className="flex items-center justify-between h-12 px-4 pb-2">
          <div className="flex items-center gap-3 min-w-0">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="shrink-0 flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
                aria-label="Volver"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-[rgba(255,255,255,0.88)] truncate">
                <span className="text-[#2dd4bf]">#</span> {channelName}
              </h3>
              {channelSubtitle && (
                <p className="text-[11px] text-[rgba(255,255,255,0.4)] truncate">
                  {channelSubtitle}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onlineCount > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#22c55e]" />
                <span className="text-xs text-[rgba(255,255,255,0.45)]">
                  {onlineCount} en linea
                </span>
              </div>
            )}
            {isMobile && onBack && (
              <button
                type="button"
                onClick={onBack}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-800 text-zinc-300 shrink-0"
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <ChatMessageList
        messages={apiMessages}
        mentionDisplayMap={mentionDisplayMap}
        isLoading={isLoading}
        hasMore={hasMore}
        onLoadMore={loadMore}
        onReply={handleReply}
        onEdit={editMessage}
        onDelete={handleDelete}
        channelId={channelId}
        onReaction={handleReaction}
      />

      {/* Typing indicator */}
      <ChatTypingIndicator typingUsers={typingUsers} />

      {/* Input */}
      <ChatInputPortal
        onSend={handleSend}
        uploadEndpoint={uploadEndpoint}
        uploadHeaders={apiHeaders}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        enableEmoji={enableEmoji}
        enableFileUpload={enableFileUpload}
      />
    </div>
  );
}
