"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatMessageData } from "@/lib/chat-types";
import { ChatMessage } from "./ChatMessage";
import { ChatDateDivider } from "./ChatDateDivider";
import { ChatMessageSystem } from "./ChatMessageSystem";

interface ChatMessageListProps {
  messages: ChatMessageData[];
  /** Map of mention id -> display name so @mentions show names instead of ids */
  mentionDisplayMap?: Record<string, string>;
  isLoading: boolean;
  hasMore: boolean;
  onLoadMore: () => Promise<void>;
  onReply: (message: ChatMessageData) => void;
  onOpenThread?: (messageId: string) => void;
  onEdit?: (messageId: string, content: string) => void;
  onDelete?: (messageId: string) => void;
  /** Retry a previously-failed optimistic message (tempId) */
  onRetry?: (messageId: string) => void;
  /** Discard a failed optimistic message */
  onDiscard?: (messageId: string) => void;
  channelId?: string;
  currentUserId?: string;
  getReadByCount?: (message: ChatMessageData) => number;
  onReaction?: (messageId: string, emoji: string) => void;
  /** Whether the current user can delete any message (admin/owner privilege) */
  canDeleteAny?: boolean;
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

  const dayNames = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const monthNames = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

  const dayName = dayNames[date.getDay()];
  const dayNum = date.getDate();
  const monthName = monthNames[date.getMonth()];
  const year = date.getFullYear();

  if (year === now.getFullYear()) {
    return `${dayName}, ${dayNum} de ${monthName}`;
  }
  return `${dayName}, ${dayNum} de ${monthName} de ${year}`;
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
  mentionDisplayMap = {},
  isLoading,
  hasMore,
  onLoadMore,
  onReply,
  onOpenThread,
  onEdit,
  onDelete,
  onRetry,
  onDiscard,
  channelId,
  currentUserId,
  getReadByCount,
  onReaction,
  canDeleteAny,
}: ChatMessageListProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const prevMessageCountRef = useRef(messages.length);
  const prevScrollHeightRef = useRef(0);
  const isLoadingMoreRef = useRef(false);
  // Count of messages that arrived while scrolled up — shown in jump-to-latest pill
  const [unseenCount, setUnseenCount] = useState(0);

  // Track scroll position (throttled via rAF to reduce re-renders during scroll)
  const scrollThrottleRef = useRef<number | null>(null);
  const latestNearBottomRef = useRef(true);
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const threshold = 100;
    latestNearBottomRef.current = scrollHeight - scrollTop - clientHeight < threshold;

    if (scrollThrottleRef.current == null) {
      scrollThrottleRef.current = window.requestAnimationFrame(() => {
        setIsNearBottom(latestNearBottomRef.current);
        scrollThrottleRef.current = null;
      });
    }

    // Infinite scroll: load more when scrolled near top (immediate, user expects it)
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

    const prevCount = prevMessageCountRef.current;
    const messageCountChanged = messages.length !== prevCount;
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

    // Auto-scroll to bottom for new messages (auto = instant, avoids jank on mobile)
    if (isNearBottom) {
      bottomRef.current?.scrollIntoView({ behavior: "auto" });
      setUnseenCount(0);
    } else if (messages.length > prevCount) {
      // New messages arrived while user is scrolled up — bump the pill counter
      setUnseenCount((n) => n + (messages.length - prevCount));
    }
  }, [messages.length, isNearBottom]);

  // Reset unseen counter the moment user scrolls back to the bottom
  useEffect(() => {
    if (isNearBottom && unseenCount > 0) setUnseenCount(0);
  }, [isNearBottom, unseenCount]);

  const scrollToLatest = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    setUnseenCount(0);
  }, []);

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
  const isOwnMessage = (msg: ChatMessageData) =>
    msg.senderId === "current-user" || (currentUserId ? msg.senderId === currentUserId : false);

  return (
    <div className="relative flex-1 min-h-0">
    <div
      ref={scrollContainerRef}
      onScroll={handleScroll}
      className="absolute inset-0 overflow-y-auto px-4 py-3 opai-chat-mobile-messages opai-chat-mobile-scroll"
    >
      {/* Loading spinner for older messages */}
      {isLoading && hasMore && messages.length > 0 && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
        </div>
      )}

      {/* Initial loading skeleton */}
      {isLoading && messages.length === 0 && (
        <div className="flex flex-col gap-4 py-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={`flex gap-2.5 ${i % 2 === 0 ? "" : "justify-end"}`}>
              {i % 2 === 0 && <div className="h-8 w-8 rounded-full bg-[rgba(255,255,255,0.06)] animate-pulse shrink-0" />}
              <div className="space-y-1.5" style={{ width: `${45 + i * 10}%` }}>
                {i % 2 === 0 && <div className="h-3 w-20 rounded bg-[rgba(255,255,255,0.06)] animate-pulse" />}
                <div className="h-10 rounded-lg bg-[rgba(255,255,255,0.04)] animate-pulse" />
              </div>
            </div>
          ))}
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
          <ChatDateDivider label={group.dateLabel} />

          {/* Messages in this group */}
          {group.messages.map((msg, idx) => {
            if (msg.systemEventType) {
              return <ChatMessageSystem key={msg.id} message={msg} />;
            }

            const prev = idx > 0 ? group.messages[idx - 1] : null;
            const TIME_GAP_MS = 5 * 60 * 1000;
            const isFirst =
              idx === 0 ||
              !prev ||
              prev.senderId !== msg.senderId ||
              !!prev.systemEventType ||
              new Date(msg.createdAt).getTime() - new Date(prev.createdAt).getTime() > TIME_GAP_MS;

            return (
              <ChatMessage
                key={msg.id}
                message={msg}
                mentionDisplayMap={mentionDisplayMap}
                isOwn={isOwnMessage(msg)}
                isFirstInGroup={isFirst}
                onReply={() => onReply(msg)}
                onOpenThread={onOpenThread}
                onEdit={onEdit}
                onDelete={onDelete}
                onRetry={onRetry}
                onDiscard={onDiscard}
                channelId={channelId}
                currentUserId={currentUserId}
                readByCount={getReadByCount?.(msg)}
                onReaction={onReaction}
                canDeleteAny={canDeleteAny}
              />
            );
          })}
        </div>
      ))}

      {/* Anchor for auto-scrolling */}
      <div ref={bottomRef} />
    </div>

    {/* Jump-to-latest pill (visible when user has scrolled up) */}
    {!isNearBottom && messages.length > 0 && (
      <button
        type="button"
        onClick={scrollToLatest}
        className={cn(
          "absolute left-1/2 -translate-x-1/2 bottom-3 z-10",
          "inline-flex items-center gap-1.5 rounded-full",
          "border border-white/[0.08] bg-[#111827]/95 backdrop-blur",
          "px-3 py-1.5 text-xs font-medium text-zinc-200",
          "shadow-lg shadow-black/40 transition-all",
          "hover:bg-[#1a2234] active:scale-95"
        )}
        aria-label={unseenCount > 0 ? `${unseenCount} mensajes nuevos` : "Ir al último mensaje"}
      >
        <ArrowDown className="h-3.5 w-3.5" />
        {unseenCount > 0 ? (
          <>
            {unseenCount} nuevo{unseenCount === 1 ? "" : "s"}
          </>
        ) : (
          <>Ir abajo</>
        )}
      </button>
    )}
    </div>
  );
}
