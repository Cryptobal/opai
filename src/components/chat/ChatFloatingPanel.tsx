"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Loader2,
  MessageCircle,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useChatFloatingContext, type ChatFloatingChannel } from "./ChatFloatingProvider";
import { ChatConversation } from "./ChatConversation";
import { usePusher } from "./hooks/usePusher";

/* ─── Component ─── */

export function ChatFloatingPanel() {
  const ctx = useChatFloatingContext();
  const panelRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const pusher = usePusher("/api/chat/pusher/auth");

  // Track whether auto-context was injected for this panel session
  const [contextInjected, setContextInjected] = useState(false);

  // Reset context injection when panel closes
  useEffect(() => {
    if (!ctx.isPanelOpen) setContextInjected(false);
  }, [ctx.isPanelOpen]);

  // ── Mobile drag-to-close ──
  const dragStartY = useRef<number | null>(null);
  const dragCurrentY = useRef<number>(0);
  const [dragOffset, setDragOffset] = useState(0);
  const isDragging = useRef(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    const relativeY = touch.clientY - rect.top;
    if (relativeY > 60) return;
    dragStartY.current = touch.clientY;
    isDragging.current = true;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current || dragStartY.current === null) return;
    const delta = e.touches[0].clientY - dragStartY.current;
    if (delta > 0) {
      dragCurrentY.current = delta;
      setDragOffset(delta);
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;
    if (dragCurrentY.current > 120) {
      ctx.closePanel();
    }
    dragStartY.current = null;
    dragCurrentY.current = 0;
    setDragOffset(0);
  }, [ctx]);

  // Close on Escape
  useEffect(() => {
    if (!ctx.isPanelOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") ctx.closePanel();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [ctx.isPanelOpen, ctx]);

  // Lock body scroll on mobile when open
  useEffect(() => {
    if (!ctx.isPanelOpen) return;
    const scrollY = window.scrollY;
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.width = "";
      document.body.style.overflow = "";
      window.scrollTo(0, scrollY);
    };
  }, [ctx.isPanelOpen]);

  // Close on backdrop click
  useEffect(() => {
    if (!ctx.isPanelOpen) return;
    const handler = (e: MouseEvent) => {
      if (backdropRef.current && e.target === backdropRef.current) {
        ctx.closePanel();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [ctx.isPanelOpen, ctx]);

  const selectedChannel = ctx.channels.find((ch) => ch.id === ctx.selectedChannelId);

  // Build auto-context prefix for first message
  const getAutoContextPrefix = useCallback(() => {
    if (!ctx.autoContext || contextInjected) return "";
    setContextInjected(true);
    return `📍 Desde: ${ctx.autoContext.pageUrl} — "${ctx.autoContext.pageLabel}"\n---\n`;
  }, [ctx.autoContext, contextInjected]);

  if (!ctx.isPanelOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        ref={backdropRef}
        className={cn(
          "fixed inset-0 z-[60] transition-opacity duration-300",
          "bg-black/40 backdrop-blur-[2px]",
          "sm:bg-black/20 sm:backdrop-blur-none",
        )}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className={cn(
          "fixed z-[61] flex flex-col bg-background border-border transition-transform duration-300 ease-out",
          "inset-x-0 bottom-0 max-h-[85dvh] rounded-t-2xl border-t shadow-2xl",
          "sm:bottom-0 sm:right-6 sm:left-auto sm:top-auto sm:w-[600px] sm:max-h-[75vh] sm:rounded-t-2xl sm:rounded-b-none sm:border sm:border-b-0 sm:shadow-[0_-8px_30px_-12px_rgba(0,0,0,0.25)]",
          ctx.isPanelOpen ? "translate-y-0" : "translate-y-full",
        )}
        style={dragOffset > 0 ? { transform: `translateY(${dragOffset}px)` } : undefined}
        role="dialog"
        aria-label="Panel de chat"
      >
        {/* Mobile drag handle */}
        <div className="sm:hidden flex justify-center pt-2 pb-1">
          <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
        </div>

        {ctx.selectedChannelId && selectedChannel ? (
          /* ── Conversation view ── */
          <div className="flex flex-col h-full min-h-0">
            <ChatConversation
              channelId={ctx.selectedChannelId}
              channelName={selectedChannel.name}
              pusher={pusher}
              onBack={() => ctx.selectChannel(null)}
              autoContextPrefix={getAutoContextPrefix}
            />
          </div>
        ) : (
          /* ── Channel list view ── */
          <>
            {/* Header */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60 shrink-0">
              <MessageCircle className="h-4 w-4 text-teal-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-semibold truncate">Chat de Grupos</h2>
                <p className="text-[10px] text-muted-foreground truncate">
                  {ctx.channels.length} {ctx.channels.length === 1 ? "grupo" : "grupos"}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={ctx.closePanel}
                aria-label="Cerrar panel"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Channel list */}
            <div className="flex-1 overflow-y-auto min-h-0">
              {ctx.loading ? (
                <div className="flex flex-col items-center gap-2 py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Cargando grupos...</p>
                </div>
              ) : ctx.channels.length === 0 ? (
                <div className="flex flex-col items-center gap-1.5 py-10 text-center px-4">
                  <MessageCircle className="h-8 w-8 text-muted-foreground/20" />
                  <p className="text-xs text-muted-foreground">
                    No perteneces a ningún grupo de chat
                  </p>
                  <p className="text-[10px] text-muted-foreground/60">
                    Contacta a un administrador para unirte a un grupo
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border/30">
                  {ctx.channels.map((ch) => (
                    <ChannelListItem
                      key={ch.id}
                      channel={ch}
                      onClick={() => ctx.selectChannel(ch.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

/* ─── Channel List Item ─── */

function ChannelListItem({
  channel,
  onClick,
}: {
  channel: ChatFloatingChannel;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/50 transition-colors text-left"
    >
      {/* Group color dot */}
      <div
        className="h-8 w-8 rounded-full flex items-center justify-center shrink-0 text-white text-xs font-bold"
        style={{ backgroundColor: channel.group?.color || "#6B7280" }}
      >
        {channel.name.charAt(0).toUpperCase()}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{channel.name}</span>
          {channel.unreadCount > 0 && (
            <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-teal-600 px-1.5 text-[10px] font-bold text-white shrink-0">
              {channel.unreadCount > 99 ? "99+" : channel.unreadCount}
            </span>
          )}
        </div>
        {channel.lastMessagePreview && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {channel.lastMessagePreview}
          </p>
        )}
      </div>

      <ArrowLeft className="h-4 w-4 text-muted-foreground/40 rotate-180 shrink-0" />
    </button>
  );
}
