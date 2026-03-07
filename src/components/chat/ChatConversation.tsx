"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type Pusher from "pusher-js";
import type { ChatMessageData, SendMessagePayload } from "@/lib/chat-types";
import type { PusherConnectionState } from "./hooks/usePusher";
import { ChatPresenceBar } from "./ChatPresenceBar";
import { ChatConnectionBanner } from "./ChatConnectionBanner";
import { ChatMessageList } from "./ChatMessageList";
import { ChatInput } from "./ChatInput";
import { ChatTypingIndicator } from "./ChatTypingIndicator";
import { ChatThreadPanel } from "./ChatThreadPanel";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Trash2 } from "lucide-react";
import { useChatMessages } from "./hooks/useChatMessages";
import { useChatChannel } from "./hooks/useChatChannel";

interface ChatConversationProps {
  channelId: string;
  channelName: string;
  pusher: Pusher | null;
  connectionState?: PusherConnectionState;
  onBack: () => void;
  /** Optional function returning a context prefix for the first message (auto-context) */
  autoContextPrefix?: () => string;
  currentUserId?: string;
  userRole?: string;
}

/**
 * Main conversation panel.
 * Integrates useChatMessages for API data and useChatChannel for real-time events.
 */
export function ChatConversation({
  channelId,
  channelName,
  pusher,
  connectionState,
  onBack,
  autoContextPrefix,
  currentUserId: currentUserIdProp,
  userRole,
}: ChatConversationProps) {
  const {
    messages: apiMessages,
    isLoading,
    hasMore,
    loadMore,
    sendMessage,
    editMessage,
    deleteMessage,
    retryMessage,
    discardMessage,
    setMessages: setApiMessages,
  } = useChatMessages(channelId);

  const [currentUserIdState, setCurrentUserIdState] = useState<string | null>(currentUserIdProp ?? null);
  const currentUserId = currentUserIdProp ?? currentUserIdState;

  const {
    messages: rtMessages,
    members,
    typingUsers,
    appendMessage: rtAppendMessage,
    clearMessages: rtClearMessages,
  } = useChatChannel(channelId, pusher, currentUserId);
  const [readCursors, setReadCursors] = useState<{ readerId: string; lastReadAt: string; lastReadMessageId: string | null }[]>([]);

  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const canDeleteAny = userRole === "owner" || userRole === "admin";

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ChatMessageData[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [replyTo, setReplyTo] = useState<{
    id: string;
    senderName: string;
    content: string;
  } | null>(null);

  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const lastReadMsgRef = useRef<string | null>(null);

  // Fetch current user ID once (only if not provided as prop)
  useEffect(() => {
    if (currentUserIdProp) return; // already provided as prop
    fetch("/api/chat/me")
      .then((r) => r.json())
      .then((j) => { if (j.success) setCurrentUserIdState(j.data.userId); })
      .catch(() => {});
  }, [currentUserIdProp]);

  // Reset thread and read tracking when channel changes
  useEffect(() => {
    setActiveThreadId(null);
    lastReadMsgRef.current = null;
  }, [channelId]);

  // Mark messages as read when opening a channel or receiving new messages
  useEffect(() => {
    if (!channelId || apiMessages.length === 0) return;
    const lastMsg = apiMessages[apiMessages.length - 1];
    if (!lastMsg || lastMsg.id === lastReadMsgRef.current) return;
    lastReadMsgRef.current = lastMsg.id;
    fetch(`/api/chat/channels/${channelId}/read`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lastReadMessageId: lastMsg.id }),
    }).catch(() => {});
  }, [channelId, apiMessages]);

  // Merge real-time messages into API messages
  useEffect(() => {
    if (rtMessages.length === 0) return;

    setApiMessages((prev) => {
      const existingIds = new Set(prev.map((m) => m.id));
      const newMessages = rtMessages.filter((m) => !existingIds.has(m.id));
      if (newMessages.length === 0) return prev;
      return [...prev, ...newMessages];
    });
  }, [rtMessages, setApiMessages]);

  // Fetch read cursors
  useEffect(() => {
    if (!channelId) return;
    const fetchCursors = async () => {
      try {
        const res = await fetch(`/api/chat/channels/${channelId}/read/cursors`);
        if (res.ok) {
          const json = await res.json();
          if (json.success) setReadCursors(json.data);
        }
      } catch {}
    };
    fetchCursors();
    const interval = setInterval(fetchCursors, 15000);
    return () => clearInterval(interval);
  }, [channelId]);

  const getReadByCount = useCallback((message: ChatMessageData) => {
    return readCursors.filter(
      (c) => new Date(c.lastReadAt) >= new Date(message.createdAt)
    ).length;
  }, [readCursors]);

  const handleSend = useCallback(
    async (payload: SendMessagePayload) => {
      const prefix = autoContextPrefix?.() || "";
      const finalPayload = prefix
        ? { ...payload, content: prefix + payload.content }
        : payload;
      await sendMessage(finalPayload);
      setReplyTo(null);
    },
    [sendMessage, autoContextPrefix]
  );

  const handleReaction = useCallback((messageId: string, emoji: string) => {
    const myId = currentUserId || "current-user";
    setApiMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId) return m;
        const reactions = [...m.reactions];
        const existing = reactions.find((r) => r.emoji === emoji);
        if (existing) {
          // Check if current user already reacted - toggle off
          const alreadyReacted = existing.senders.some((s) => s.id === myId || s.id === "current-user");
          if (alreadyReacted) {
            const newSenders = existing.senders.filter((s) => s.id !== myId && s.id !== "current-user");
            if (newSenders.length === 0) {
              return { ...m, reactions: reactions.filter((r) => r.emoji !== emoji) };
            }
            return {
              ...m,
              reactions: reactions.map((r) =>
                r.emoji === emoji ? { ...r, count: newSenders.length, senders: newSenders } : r
              ),
            };
          }
          // Add reaction
          return {
            ...m,
            reactions: reactions.map((r) =>
              r.emoji === emoji
                ? { ...r, count: r.count + 1, senders: [...r.senders, { id: myId, name: "Yo", type: "ADMIN" as const }] }
                : r
            ),
          };
        }
        // New emoji reaction
        return {
          ...m,
          reactions: [...reactions, { emoji, count: 1, senders: [{ id: myId, name: "Yo", type: "ADMIN" as const }] }],
        };
      })
    );
  }, [setApiMessages, currentUserId]);

  const handleReply = useCallback((message: ChatMessageData) => {
    setReplyTo({
      id: message.id,
      senderName: message.senderName,
      content: message.content,
    });
  }, []);

  const handleSearch = useCallback(
    (query: string) => {
      setSearchQuery(query);
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);

      if (!query.trim()) {
        setSearchResults([]);
        setIsSearching(false);
        return;
      }

      setIsSearching(true);
      searchDebounceRef.current = setTimeout(async () => {
        try {
          const params = new URLSearchParams({
            search: query,
            limit: "50",
          });
          const res = await fetch(
            `/api/chat/channels/${channelId}/messages?${params.toString()}`
          );
          if (!res.ok) throw new Error("Search failed");
          const json = await res.json();
          if (json.success) {
            setSearchResults(json.data);
          }
        } catch (err) {
          console.error("Search error:", err);
        } finally {
          setIsSearching(false);
        }
      }, 400);
    },
    [channelId]
  );

  const handleClearMessages = useCallback(async () => {
    setClearConfirmOpen(false);
    try {
      const res = await fetch(`/api/chat/channels/${channelId}/messages`, { method: "DELETE" });
      if (res.ok) {
        setApiMessages([]);
        rtClearMessages();
      }
    } catch (err) {
      console.error("Error clearing messages:", err);
    }
  }, [channelId, setApiMessages, rtClearMessages]);

  const onlineCount = members.length;

  return (
    <div className="flex h-full">
      {/* Main conversation */}
      <div className={`flex flex-col ${activeThreadId ? "hidden sm:flex sm:flex-1" : "flex-1"}`}>
        <ChatPresenceBar
          channelName={channelName}
          onlineCount={onlineCount}
          onBack={onBack}
          onSearch={handleSearch}
          isSearching={isSearching}
          channelId={channelId}
        >
          {canDeleteAny && (
            <button
              type="button"
              onClick={() => setClearConfirmOpen(true)}
              className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-red-400 transition-colors"
              title="Limpiar conversacion"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </ChatPresenceBar>

        {connectionState && (
          <ChatConnectionBanner
            connectionState={connectionState}
            onRetry={() => pusher?.connect()}
          />
        )}

        <ChatMessageList
          messages={searchQuery.trim() ? searchResults : apiMessages}
          isLoading={searchQuery.trim() ? isSearching : isLoading}
          hasMore={searchQuery.trim() ? false : hasMore}
          onLoadMore={loadMore}
          onReply={handleReply}
          onOpenThread={setActiveThreadId}
          onEdit={editMessage}
          onDelete={deleteMessage}
          channelId={channelId}
          currentUserId={currentUserId ?? undefined}
          getReadByCount={getReadByCount}
          onReaction={handleReaction}
          canDeleteAny={canDeleteAny}
          onRetry={retryMessage}
          onDiscard={discardMessage}
        />

        <ChatTypingIndicator typingUsers={typingUsers} />

        <ChatInput
          onSend={handleSend}
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
          channelId={channelId}
          pusher={pusher}
        />
      </div>

      {/* Clear messages confirm dialog */}
      <ConfirmDialog
        open={clearConfirmOpen}
        onOpenChange={setClearConfirmOpen}
        title="Limpiar conversacion"
        description="Se eliminaran todos los mensajes de este canal. Esta accion no se puede deshacer."
        confirmLabel="Eliminar todo"
        onConfirm={handleClearMessages}
        variant="destructive"
      />

      {/* Thread panel */}
      {activeThreadId && (
        <div className="w-full sm:w-[350px] sm:max-w-[350px] shrink-0">
          <ChatThreadPanel
            channelId={channelId}
            threadRootId={activeThreadId}
            pusher={pusher}
            onClose={() => setActiveThreadId(null)}
          />
        </div>
      )}
    </div>
  );
}
