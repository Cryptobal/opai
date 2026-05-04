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
  const bottomSentinelRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  // isNearBottom es ref (sin re-render) para no romper momentum scroll iOS
  const isNearBottomRef = useRef(true);
  // El pill "ir abajo" sí necesita state porque debe re-render para mostrarse,
  // pero solo cambia cuando cruzamos el sentinel — máximo una vez por gesto.
  const [showJumpPill, setShowJumpPill] = useState(false);
  const [unseenCount, setUnseenCount] = useState(0);
  const prevMessageCountRef = useRef(messages.length);
  const prevScrollHeightRef = useRef(0);
  const isLoadingMoreRef = useRef(false);

  // Observer para "near bottom" — sin setState durante scroll
  useEffect(() => {
    const sentinel = bottomSentinelRef.current;
    const root = scrollContainerRef.current;
    if (!sentinel || !root) return;

    const obs = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        const near = entry.isIntersecting;
        isNearBottomRef.current = near;
        // Solo hacemos setState si cambia el estado del pill, no en cada scroll
        setShowJumpPill((prev) => (prev === !near ? prev : !near));
        if (near) setUnseenCount(0);
      },
      { root, rootMargin: "0px 0px 100px 0px", threshold: 0 }
    );
    obs.observe(sentinel);
    return () => obs.disconnect();
  }, []);

  // Observer para load more arriba — sin onScroll
  useEffect(() => {
    const sentinel = topSentinelRef.current;
    const root = scrollContainerRef.current;
    if (!sentinel || !root) return;
    if (!hasMore) return;

    const obs = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting && hasMore && !isLoading && !isLoadingMoreRef.current) {
          isLoadingMoreRef.current = true;
          prevScrollHeightRef.current = root.scrollHeight;
          onLoadMore().finally(() => { isLoadingMoreRef.current = false; });
        }
      },
      { root, rootMargin: "200px 0px 0px 0px", threshold: 0 }
    );
    obs.observe(sentinel);
    return () => obs.disconnect();
  }, [hasMore, isLoading, onLoadMore]);

  // Auto-scroll al fondo en mensajes nuevos (si estábamos cerca del fondo)
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const prevCount = prevMessageCountRef.current;
    const messageCountChanged = messages.length !== prevCount;
    prevMessageCountRef.current = messages.length;
    if (!messageCountChanged) return;

    // Carga de mensajes antiguos: mantener posición visual
    if (isLoadingMoreRef.current) {
      const newScrollHeight = container.scrollHeight;
      const scrollDiff = newScrollHeight - prevScrollHeightRef.current;
      if (scrollDiff > 0 && prevScrollHeightRef.current > 0) {
        container.scrollTop += scrollDiff;
      }
      prevScrollHeightRef.current = newScrollHeight;
      return;
    }

    if (isNearBottomRef.current) {
      bottomSentinelRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
      setUnseenCount(0);
    } else if (messages.length > prevCount) {
      setUnseenCount((n) => n + (messages.length - prevCount));
    }
  }, [messages.length]);

  const scrollToLatest = useCallback(() => {
    bottomSentinelRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    setUnseenCount(0);
  }, []);

  // Initial scroll al fondo
  useEffect(() => {
    if (messages.length > 0 && scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      container.scrollTop = container.scrollHeight;
    }
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

  const isOwnMessage = (msg: ChatMessageData) =>
    msg.senderId === "current-user" || (currentUserId ? msg.senderId === currentUserId : false);

  return (
    <div className="relative flex-1 min-h-0">
      <div
        ref={scrollContainerRef}
        className="absolute inset-0 overflow-y-auto px-4 py-3 opai-chat-mobile-messages opai-chat-mobile-scroll"
        // Garantiza que solo aceptemos pan vertical en este contenedor
        style={{ touchAction: "pan-y" }}
      >
        {/* Sentinel arriba — IntersectionObserver dispara loadMore */}
        <div ref={topSentinelRef} aria-hidden="true" />

        {isLoading && hasMore && messages.length > 0 && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
          </div>
        )}

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

        {!isLoading && messages.length === 0 && (
          <div className="flex flex-1 items-center justify-center py-12 text-zinc-500 text-sm">
            No hay mensajes aun. Envia el primero.
          </div>
        )}

        {groupedMessages.map((group) => (
          <div key={group.dateKey}>
            <ChatDateDivider label={group.dateLabel} />
            {group.messages.map((msg, idx) => {
              if (msg.systemEventType) return <ChatMessageSystem key={msg.id} message={msg} />;
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

        {/* Sentinel abajo — IntersectionObserver detecta near-bottom */}
        <div ref={bottomSentinelRef} aria-hidden="true" />
      </div>

      {showJumpPill && messages.length > 0 && (
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
          {unseenCount > 0 ? <>{unseenCount} nuevo{unseenCount === 1 ? "" : "s"}</> : <>Ir abajo</>}
        </button>
      )}
    </div>
  );
}
