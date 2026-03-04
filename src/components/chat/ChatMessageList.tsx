"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatMessageData } from "@/lib/chat-types";
import { ChatMessage } from "./ChatMessage";
import { ChatMessageSystem } from "./ChatMessageSystem";

interface ChatMessageListProps {
  messages: ChatMessageData[];
  isLoading: boolean;
  hasMore: boolean;
  onLoadMore: () => Promise<void>;
  onReply: (message: ChatMessageData) => void;
  onOpenThread?: (messageId: string) => void;
  currentUserId?: string;
}

/**
 * Format a date for the group separator.
 * Returns "Hoy", "Ayer", or a formatted date like "12 feb 2025".
 */
function formatDateSeparator(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const messageDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.floor(
    (today.getTime() - messageDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffDays === 0) return "Hoy";
  if (diffDays === 1) return "Ayer";

  const day = date.getDate();
  const months = [
    "ene", "feb", "mar", "abr", "may", "jun",
    "jul", "ago", "sep", "oct", "nov", "dic",
  ];
  const month = months[date.getMonth()];
  const year = date.getFullYear();

  if (year === now.getFullYear()) {
    return `${day} ${month}`;
  }
  return `${day} ${month} ${year}`;
}

/**
 * Get the date key for grouping (YYYY-MM-DD).
 */
function getDateKey(dateStr: string): string {
  const date = new Date(dateStr);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * Scrollable message list with infinite scroll.
 * Groups messages by date with separators.
 * Auto-scrolls to bottom on new messages (only if already near bottom).
 */
export function ChatMessageList({
  messages,
  isLoading,
  hasMore,
  onLoadMore,
  onReply,
  onOpenThread,
  currentUserId,
}: ChatMessageListProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const prevMessageCountRef = useRef(messages.length);
  const prevScrollHeightRef = useRef(0);
  const isLoadingMoreRef = useRef(false);

  // Track scroll position to determine if we're near bottom
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const threshold = 100;
    setIsNearBottom(scrollHeight - scrollTop - clientHeight < threshold);

    // Infinite scroll: load more when scrolled near top
    if (scrollTop < 80 && hasMore && !isLoading && !isLoadingMoreRef.current) {
      isLoadingMoreRef.current = true;
      prevScrollHeightRef.current = container.scrollHeight;
      onLoadMore().finally(() => {
        isLoadingMoreRef.current = false;
      });
    }
  }, [hasMore, isLoading, onLoadMore]);

  // Auto-scroll to bottom on new messages if user was near bottom
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const messageCountChanged = messages.length !== prevMessageCountRef.current;
    prevMessageCountRef.current = messages.length;

    if (!messageCountChanged) return;

    // If we were loading older messages (prepend), maintain scroll position
    if (isLoadingMoreRef.current || (!isNearBottom && container.scrollHeight > prevScrollHeightRef.current + 200)) {
      const newScrollHeight = container.scrollHeight;
      const scrollDiff = newScrollHeight - prevScrollHeightRef.current;
      if (scrollDiff > 0 && prevScrollHeightRef.current > 0) {
        container.scrollTop += scrollDiff;
      }
      prevScrollHeightRef.current = newScrollHeight;
      return;
    }

    // Auto-scroll to bottom for new messages
    if (isNearBottom) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length, isNearBottom]);

  // Initial scroll to bottom
  useEffect(() => {
    if (messages.length > 0 && scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      container.scrollTop = container.scrollHeight;
    }
    // Only run on initial load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length > 0]);

  // Group messages by date
  const groupedMessages: { dateKey: string; dateLabel: string; messages: ChatMessageData[] }[] = [];
  let currentDateKey = "";

  for (const msg of messages) {
    const dateKey = getDateKey(msg.createdAt);
    if (dateKey !== currentDateKey) {
      currentDateKey = dateKey;
      groupedMessages.push({
        dateKey,
        dateLabel: formatDateSeparator(msg.createdAt),
        messages: [msg],
      });
    } else {
      groupedMessages[groupedMessages.length - 1].messages.push(msg);
    }
  }

  // Determine which messages are "own" (sent by current user)
  // We use a simple heuristic: if senderType is ADMIN and senderId matches
  // or if the optimistic "current-user" ID is used
  const isOwnMessage = (msg: ChatMessageData) =>
    msg.senderId === "current-user" || msg.senderType === "ADMIN";

  return (
    <div
      ref={scrollContainerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto px-4 py-3"
    >
      {/* Loading spinner for older messages */}
      {isLoading && hasMore && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
        </div>
      )}

      {/* No messages state */}
      {!isLoading && messages.length === 0 && (
        <div className="flex flex-1 items-center justify-center py-12 text-zinc-500 text-sm">
          No hay mensajes aun. Envia el primero.
        </div>
      )}

      {/* Message groups */}
      {groupedMessages.map((group) => (
        <div key={group.dateKey}>
          {/* Date separator */}
          <div className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px bg-zinc-800" />
            <span className="shrink-0 text-xs text-zinc-500 font-medium">
              {group.dateLabel}
            </span>
            <div className="flex-1 h-px bg-zinc-800" />
          </div>

          {/* Messages in this group */}
          {group.messages.map((msg) =>
            msg.systemEventType ? (
              <ChatMessageSystem key={msg.id} message={msg} />
            ) : (
              <ChatMessage
                key={msg.id}
                message={msg}
                isOwn={isOwnMessage(msg)}
                onReply={() => onReply(msg)}
                onOpenThread={onOpenThread}
                currentUserId={currentUserId}
              />
            )
          )}
        </div>
      ))}

      {/* Anchor for auto-scrolling */}
      <div ref={bottomRef} />
    </div>
  );
}
