"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type Pusher from "pusher-js";
import type { ChatMessageData, SendMessagePayload } from "@/lib/chat-types";
import { ChatPresenceBar } from "./ChatPresenceBar";
import { ChatMessageList } from "./ChatMessageList";
import { ChatInput } from "./ChatInput";
import { ChatTypingIndicator } from "./ChatTypingIndicator";
import { ChatThreadPanel } from "./ChatThreadPanel";
import { useChatMessages } from "./hooks/useChatMessages";
import { useChatChannel } from "./hooks/useChatChannel";

interface ChatConversationProps {
  channelId: string;
  channelName: string;
  pusher: Pusher | null;
  onBack: () => void;
  /** Optional function returning a context prefix for the first message (auto-context) */
  autoContextPrefix?: () => string;
}

/**
 * Main conversation panel.
 * Integrates useChatMessages for API data and useChatChannel for real-time events.
 */
export function ChatConversation({
  channelId,
  channelName,
  pusher,
  onBack,
  autoContextPrefix,
}: ChatConversationProps) {
  const {
    messages: apiMessages,
    isLoading,
    hasMore,
    loadMore,
    sendMessage,
    editMessage,
    deleteMessage,
    setMessages: setApiMessages,
  } = useChatMessages(channelId);

  const {
    messages: rtMessages,
    members,
    typingUsers,
    appendMessage: rtAppendMessage,
  } = useChatChannel(channelId, pusher);

  const [readCursors, setReadCursors] = useState<{ readerId: string; lastReadAt: string; lastReadMessageId: string | null }[]>([]);

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
        />

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
          getReadByCount={getReadByCount}
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
