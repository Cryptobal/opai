"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ChatMessageData,
  MessagesResponse,
  SendMessagePayload,
  ChatAttachment,
} from "@/lib/chat-types";

type UseChatMessagesReturn = {
  messages: ChatMessageData[];
  isLoading: boolean;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  sendMessage: (payload: SendMessagePayload) => Promise<ChatMessageData | null>;
  editMessage: (messageId: string, content: string) => Promise<boolean>;
  deleteMessage: (messageId: string) => Promise<boolean>;
  retryMessage: (messageId: string) => Promise<void>;
  discardMessage: (messageId: string) => void;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessageData[]>>;
};

/**
 * Hook that fetches messages from the API with cursor-based pagination,
 * and provides methods to send, edit, and delete messages.
 */
export function useChatMessages(channelId: string | null): UseChatMessagesReturn {
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const cursorRef = useRef<string | null>(null);
  const initialFetchDone = useRef(false);

  // Reset state when channel changes
  useEffect(() => {
    setMessages([]);
    setIsLoading(false);
    setHasMore(true);
    cursorRef.current = null;
    initialFetchDone.current = false;
  }, [channelId]);

  // Fetch messages (initial + pagination)
  const fetchMessages = useCallback(
    async (cursor?: string | null) => {
      if (!channelId) return;

      setIsLoading(true);
      try {
        const params = new URLSearchParams({ limit: "50" });
        if (cursor) params.set("cursor", cursor);

        const res = await fetch(
          `/api/chat/channels/${channelId}/messages?${params.toString()}`
        );
        if (!res.ok) throw new Error("Failed to fetch messages");

        const json: MessagesResponse = await res.json();

        if (json.success) {
          // API returns messages in desc order (newest first) — reverse for chronological display
          const sorted = [...json.data].reverse();
          setMessages((prev) => {
            // When loading older messages (cursor), prepend. Otherwise, replace.
            if (cursor) {
              const existingIds = new Set(prev.map((m) => m.id));
              const newMessages = sorted.filter((m) => !existingIds.has(m.id));
              return [...newMessages, ...prev];
            }
            return sorted;
          });
          setHasMore(json.meta.hasMore);
          cursorRef.current = json.meta.nextCursor;
        }
      } catch (err) {
        console.error("[useChatMessages] fetchMessages error:", err);
      } finally {
        setIsLoading(false);
      }
    },
    [channelId]
  );

  // Initial fetch
  useEffect(() => {
    if (!channelId || initialFetchDone.current) return;
    initialFetchDone.current = true;
    fetchMessages();
  }, [channelId, fetchMessages]);

  // Load more (older messages)
  const loadMore = useCallback(async () => {
    if (!hasMore || isLoading || !cursorRef.current) return;
    await fetchMessages(cursorRef.current);
  }, [hasMore, isLoading, fetchMessages]);

  // Send a new message with optimistic update
  const sendMessage = useCallback(
    async (payload: SendMessagePayload): Promise<ChatMessageData | null> => {
      if (!channelId) return null;

      // Create optimistic message
      const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const optimisticMsg: ChatMessageData = {
        id: tempId,
        channelId,
        senderType: "ADMIN",
        senderId: "current-user",
        senderName: "Yo",
        senderAvatar: null,
        content: payload.content,
        contentHtml: null,
        replyTo: null,
        threadRootId: null,
        replyCount: 0,
        lastReplyAt: null,
        attachments: payload.attachments || null,
        reactions: [],
        systemEventType: null,
        systemEventData: null,
        isEdited: false,
        createdAt: new Date().toISOString(),
        status: "sending",
        _payload: payload,
      };

      setMessages((prev) => [...prev, optimisticMsg]);

      try {
        const res = await fetch(`/api/chat/channels/${channelId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) throw new Error("Failed to send message");

        const json = await res.json();
        if (json.success && json.data) {
          // Replace optimistic message with the real one (clear status)
          setMessages((prev) =>
            prev.map((m) => (m.id === tempId ? { ...json.data, status: undefined, _payload: undefined } : m))
          );
          return json.data as ChatMessageData;
        }
        // If the API didn't return success, mark as failed
        setMessages((prev) =>
          prev.map((m) => m.id === tempId ? { ...m, status: "failed" as const } : m)
        );
        return null;
      } catch (err) {
        console.error("[useChatMessages] sendMessage error:", err);
        // Mark optimistic message as failed instead of removing
        setMessages((prev) =>
          prev.map((m) => m.id === tempId ? { ...m, status: "failed" as const } : m)
        );
        return null;
      }
    },
    [channelId]
  );

  // Edit an existing message
  const editMessage = useCallback(
    async (messageId: string, content: string): Promise<boolean> => {
      if (!channelId) return false;

      // Optimistic update
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, content, isEdited: true } : m))
      );

      try {
        const res = await fetch(
          `/api/chat/channels/${channelId}/messages/${messageId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content }),
          }
        );
        return res.ok;
      } catch (err) {
        console.error("[useChatMessages] editMessage error:", err);
        return false;
      }
    },
    [channelId]
  );

  // Delete a message
  const deleteMessage = useCallback(
    async (messageId: string): Promise<boolean> => {
      if (!channelId) return false;

      // Optimistic removal
      const removed = messages.find((m) => m.id === messageId);
      setMessages((prev) => prev.filter((m) => m.id !== messageId));

      try {
        const res = await fetch(
          `/api/chat/channels/${channelId}/messages/${messageId}`,
          { method: "DELETE" }
        );
        if (!res.ok && removed) {
          // Restore on failure
          setMessages((prev) => [...prev, removed].sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          ));
        }
        return res.ok;
      } catch (err) {
        console.error("[useChatMessages] deleteMessage error:", err);
        if (removed) {
          setMessages((prev) => [...prev, removed].sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          ));
        }
        return false;
      }
    },
    [channelId, messages]
  );

  // Retry a failed message
  const retryMessage = useCallback(
    async (messageId: string) => {
      const msg = messages.find((m) => m.id === messageId);
      if (!msg?._payload || !channelId) return;

      // Mark as sending again
      setMessages((prev) =>
        prev.map((m) => m.id === messageId ? { ...m, status: "sending" as const } : m)
      );

      try {
        const res = await fetch(`/api/chat/channels/${channelId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(msg._payload),
        });

        if (!res.ok) throw new Error("Failed");

        const json = await res.json();
        if (json.success && json.data) {
          setMessages((prev) =>
            prev.map((m) => m.id === messageId ? { ...json.data, status: undefined, _payload: undefined } : m)
          );
        } else {
          setMessages((prev) =>
            prev.map((m) => m.id === messageId ? { ...m, status: "failed" as const } : m)
          );
        }
      } catch {
        setMessages((prev) =>
          prev.map((m) => m.id === messageId ? { ...m, status: "failed" as const } : m)
        );
      }
    },
    [channelId, messages]
  );

  // Discard a failed message
  const discardMessage = useCallback(
    (messageId: string) => {
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    },
    []
  );

  return {
    messages,
    isLoading,
    hasMore,
    loadMore,
    sendMessage,
    editMessage,
    deleteMessage,
    retryMessage,
    discardMessage,
    setMessages,
  };
}
