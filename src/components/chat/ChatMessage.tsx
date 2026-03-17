"use client";

import { useState, useRef, useCallback, useEffect, type ReactNode } from "react";
import { Reply, MoreHorizontal, MessageSquare, Pencil, Trash2, Copy, SmilePlus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatMessageData, ChatSenderType } from "@/lib/chat-types";
import { ChatAttachmentPreview } from "./ChatAttachmentPreview";
import { ChatReactionBar } from "./ChatReactionBar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ChatMessageProps {
  message: ChatMessageData;
  /** Map of mention id -> display name so @mentions show names instead of ids/phones */
  mentionDisplayMap?: Record<string, string>;
  isOwn: boolean;
  /** Whether this message starts a new visual group (different sender, time gap, etc.) */
  isFirstInGroup?: boolean;
  onReply: () => void;
  onOpenThread?: (messageId: string) => void;
  onEdit?: (messageId: string, content: string) => void;
  onDelete?: (messageId: string) => void;
  channelId?: string;
  currentUserId?: string;
  readByCount?: number;
  onReaction?: (messageId: string, emoji: string) => void;
  /** Whether the current user can delete any message (admin/owner privilege) */
  canDeleteAny?: boolean;
}

/**
 * Returns a color class based on sender type.
 */
function senderColor(type: ChatSenderType): string {
  switch (type) {
    case "ADMIN":
      return "text-blue-400";
    case "GUARD":
      return "text-emerald-400";
    case "CLIENT":
      return "text-amber-400";
    default:
      return "text-zinc-400";
  }
}

/**
 * Format time from ISO string to HH:MM.
 */
function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/**
 * Get initials from a name string (up to 2 characters).
 */
function getInitials(name: string): string {
  return name.split(" ").map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

/**
 * Slack-style full-width message component.
 * All messages render left-aligned. Grouped messages show a compact layout.
 */
/**
 * Entity type configuration for context/entity reference rendering.
 */
const ENTITY_CONFIG: Record<string, { icon: string; color: string; basePath: string }> = {
  lead: { icon: "🎯", color: "bg-orange-500/20 text-orange-300 border-orange-500/30", basePath: "/crm/leads" },
  account: { icon: "🏢", color: "bg-blue-500/20 text-blue-300 border-blue-500/30", basePath: "/crm/accounts" },
  contact: { icon: "👤", color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30", basePath: "/crm/contacts" },
  deal: { icon: "💼", color: "bg-purple-500/20 text-purple-300 border-purple-500/30", basePath: "/crm/deals" },
  quote: { icon: "📋", color: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30", basePath: "/crm/cotizaciones" },
  installation: { icon: "📍", color: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30", basePath: "/crm/installations" },
  guardia: { icon: "🛡️", color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30", basePath: "/personas/guardias" },
  document: { icon: "📄", color: "bg-amber-500/20 text-amber-300 border-amber-500/30", basePath: "/opai/documentos" },
  pauta_mensual: { icon: "📊", color: "bg-violet-500/20 text-violet-300 border-violet-500/30", basePath: "/ops/pauta-mensual" },
  channel: { icon: "💬", color: "bg-teal-500/20 text-teal-300 border-teal-500/30", basePath: "/chat" },
};

/**
 * Render message content with @mention and #entity reference highlighting.
 * Mention format: <@userId> or <@todos>
 * Entity format: <#type:id:title>
 *
 * Note: contentHtml is pre-sanitized on the server side before storage.
 */
function renderContent(
  content: string,
  currentUserId?: string,
  mentionDisplayMap?: Record<string, string>
): ReactNode {
  // Parse <@userId> and <#type:id:title> patterns
  const parts = content.split(/(<@[^>]+>|<#[^>]+>)/g);
  if (parts.length === 1) return content;

  return parts.map((part, i) => {
    // Handle @mentions
    const mentionMatch = part.match(/^<@([^>]+)>$/);
    if (mentionMatch) {
      const token = mentionMatch[1];
      const isTodos = token === "todos";
      const isMe = !isTodos && token === currentUserId;
      const displayName = mentionDisplayMap?.[token] ?? token;

      return (
        <span
          key={i}
          className={cn(
            "inline-flex items-center rounded px-1 py-0.5 text-xs font-medium",
            isTodos
              ? "bg-red-500/20 text-red-300"
              : isMe
                ? "bg-blue-500/30 text-blue-200"
                : "bg-teal-500/20 text-teal-300"
          )}
        >
          @{isTodos ? "todos" : displayName}
        </span>
      );
    }

    // Handle #entity references
    const entityMatch = part.match(/^<#([^:]+):([^:]+):([^>]+)>$/);
    if (entityMatch) {
      const [, type, id, title] = entityMatch;
      const config = ENTITY_CONFIG[type];
      if (!config) return part;

      const href =
        type === "pauta_mensual"
          ? `/ops/pauta-mensual?installationId=${id}`
          : type === "channel"
            ? `${config.basePath}?channelId=${id}`
            : `${config.basePath}/${id}`;

      return (
        <a
          key={i}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium no-underline hover:brightness-125 transition-all",
            config.color
          )}
        >
          <span>{config.icon}</span>
          <span>{title}</span>
        </a>
      );
    }

    return part;
  });
}

export function ChatMessage({ message, mentionDisplayMap, isOwn, isFirstInGroup, onReply, onOpenThread, onEdit, onDelete, channelId, currentUserId, readByCount, onReaction, canDeleteAny }: ChatMessageProps) {
  const [showTrigger, setShowTrigger] = useState(false);
  const [showReactionBar, setShowReactionBar] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messageRowRef = useRef<HTMLDivElement>(null);

  const handleReaction = useCallback(async (emoji: string) => {
    if (!channelId) return;
    try {
      await fetch(`/api/chat/channels/${channelId}/messages/${message.id}/reactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji }),
      });
      onReaction?.(message.id, emoji);
    } catch (err) {
      console.error("Error toggling reaction:", err);
    }
  }, [channelId, message.id, onReaction]);

  const showHeader = isFirstInGroup ?? true;
  const senderColorClass = senderColor(message.senderType);

  const closeMobile = useCallback(() => {
    setShowMobileMenu(false);
  }, []);
  const closeDesktop = useCallback(() => { setShowReactionBar(false); setShowTrigger(false); }, []);

  return (
    <div
      ref={messageRowRef}
      className={cn(
        "group relative flex items-start hover:bg-[rgba(255,255,255,0.04)] px-4 transition-colors duration-100",
        showHeader ? "pt-2 pb-0.5" : "py-0.5"
      )}
      onMouseEnter={() => { if (!message.systemEventType) setShowTrigger(true); }}
      onMouseLeave={() => { if (!dropdownOpen) { setShowTrigger(false); setShowReactionBar(false); } }}
      onTouchStart={(e) => {
        if (message.systemEventType) return;
        if (showMobileMenu) return;
        longPressTimerRef.current = setTimeout(() => {
          e.preventDefault();
          navigator.vibrate?.(10);
          setShowMobileMenu(true);
        }, 500);
      }}
      onTouchEnd={() => {
        if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
      }}
      onTouchMove={() => {
        if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
      }}
      onContextMenu={(e) => { if (showMobileMenu) e.preventDefault(); }}
      style={showMobileMenu ? { WebkitUserSelect: "none", userSelect: "none" as const, WebkitTouchCallout: "none" as const } : undefined}
    >
      {/* Avatar or hover timestamp */}
      {showHeader ? (
        <div className="w-9 h-9 shrink-0 mr-3 rounded-lg bg-zinc-700 flex items-center justify-center overflow-hidden">
          {message.senderAvatar ? (
            <img src={message.senderAvatar} alt={message.senderName} className="w-full h-full object-cover" />
          ) : (
            <span className="text-xs font-bold text-zinc-300">{getInitials(message.senderName)}</span>
          )}
        </div>
      ) : (
        <span className="w-9 shrink-0 mr-3 text-[11px] text-[rgba(255,255,255,0.28)] opacity-0 group-hover:opacity-100 transition-opacity text-right pt-0.5 select-none">
          {formatTime(message.createdAt)}
        </span>
      )}

      {/* Message body */}
      <div className="flex-1 min-w-0">
        {/* Sender name + timestamp (only for first in group) */}
        {showHeader && (
          <div className="flex items-baseline gap-2">
            <span className={cn("text-sm font-bold", senderColorClass)}>{message.senderName}</span>
            <span className="text-[11px] text-[rgba(255,255,255,0.28)]">{formatTime(message.createdAt)}</span>
          </div>
        )}

        {/* Reply quote */}
        {message.replyTo && (
          <div className="border-l-2 border-zinc-600 pl-2 mb-1.5 py-0.5">
            <p className="text-xs font-medium text-zinc-400">
              {message.replyTo.senderName}
            </p>
            <p className="text-xs text-zinc-500 line-clamp-2">
              {message.replyTo.content}
            </p>
          </div>
        )}

        {/* Content with mention highlighting -- contentHtml is pre-sanitized server-side */}
        {isEditing ? (
          <div className="space-y-2">
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="w-full resize-none rounded-lg border border-zinc-600 bg-zinc-800 px-2 py-1.5 text-sm text-zinc-100 focus:border-zinc-500 focus:outline-none"
              rows={2}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (editContent.trim() && onEdit) {
                    onEdit(message.id, editContent.trim());
                    setIsEditing(false);
                  }
                }
                if (e.key === "Escape") {
                  setIsEditing(false);
                }
              }}
            />
            <div className="flex items-center gap-1.5 text-[10px]">
              <span className="text-zinc-500">Esc para cancelar</span>
              <span className="text-zinc-600">&middot;</span>
              <span className="text-zinc-500">Enter para guardar</span>
            </div>
          </div>
        ) : message.contentHtml ? (
          <div
            className="break-words whitespace-pre-wrap chat-html-content text-sm leading-relaxed text-zinc-200 select-none lg:select-text"
            dangerouslySetInnerHTML={{ __html: message.contentHtml }}
          />
        ) : (
          <p
            className="break-words whitespace-pre-wrap text-sm leading-relaxed text-zinc-200 select-none lg:select-text"
          >
            {renderContent(message.content, currentUserId, mentionDisplayMap)}
          </p>
        )}

        {/* Attachments */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="mt-2">
            <ChatAttachmentPreview attachments={message.attachments} />
          </div>
        )}

        {/* Edited indicator */}
        {message.isEdited && (
          <span className="text-[10px] text-zinc-500 italic">(editado)</span>
        )}

        {/* Read receipt (own messages only) */}
        {isOwn && typeof readByCount === "number" && readByCount > 0 && (
          <span className="text-[10px] text-blue-400 ml-1" title={`Visto por ${readByCount}`}>
            ✓✓
          </span>
        )}

        {/* Reactions */}
        {message.reactions.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {message.reactions.map((reaction) => (
              <button
                key={reaction.emoji}
                type="button"
                onClick={() => handleReaction(reaction.emoji)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-xl border px-2 py-0.5 text-xs transition-colors",
                  reaction.senders.some(s => s.id === currentUserId)
                    ? "bg-[rgba(45,212,191,0.12)] border-[rgba(45,212,191,0.3)] hover:bg-[rgba(45,212,191,0.2)]"
                    : "bg-[rgba(255,255,255,0.06)] border-[rgba(255,255,255,0.06)] hover:bg-[rgba(255,255,255,0.1)]"
                )}
                title={reaction.senders.map((s) => s.name).join(", ")}
              >
                <span>{reaction.emoji}</span>
                <span className="text-[rgba(255,255,255,0.45)]">{reaction.count}</span>
              </button>
            ))}
          </div>
        )}

        {/* Thread indicator */}
        {message.replyCount > 0 && onOpenThread && (
          <button
            type="button"
            onClick={() => onOpenThread(message.id)}
            className={cn(
              "flex items-center gap-1.5 mt-1 px-2 py-1 rounded-lg text-xs transition-colors",
              "text-teal-400 hover:bg-teal-500/10"
            )}
          >
            <MessageSquare className="h-3 w-3" />
            <span className="font-medium">
              {message.replyCount} {message.replyCount === 1 ? "respuesta" : "respuestas"}
            </span>
          </button>
        )}
      </div>

      {/* Desktop: emoji trigger on hover (hidden on mobile via lg: prefix) */}
      {showTrigger && !showReactionBar && !message.systemEventType && (
        <button
          type="button"
          onClick={() => setShowReactionBar(true)}
          className="absolute right-4 -top-3 z-10 hidden lg:flex h-7 w-7 items-center justify-center rounded-lg transition-all duration-150 hover:bg-white/[0.08]"
          style={{
            backgroundColor: "#0d1220",
            border: "1px solid rgba(255,255,255,0.06)",
            boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
          }}
          title="Reaccionar"
        >
          <SmilePlus className="h-4 w-4 text-zinc-400" />
        </button>
      )}

      {/* Desktop: expanded reaction bar */}
      {showReactionBar && channelId && (
        <ChatReactionBar
          mode="hover"
          onReact={(emoji) => { handleReaction(emoji); closeDesktop(); }}
          onReply={() => { onReply(); closeDesktop(); }}
          onThread={onOpenThread ? () => { onOpenThread(message.id); closeDesktop(); } : undefined}
          onClose={closeDesktop}
          moreSlot={
            <DropdownMenu open={dropdownOpen} onOpenChange={(open) => {
              setDropdownOpen(open);
              if (!open) closeDesktop();
            }}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex h-7 w-7 items-center justify-center rounded text-zinc-400 hover:bg-white/[0.08] hover:text-zinc-200 transition-colors"
                  title="Más opciones"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="z-[70] w-44">
                {onOpenThread && (
                  <DropdownMenuItem onClick={() => { onOpenThread(message.id); closeDesktop(); }}>
                    <MessageSquare className="mr-2 h-3.5 w-3.5" />
                    Abrir hilo
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => { navigator.clipboard.writeText(message.content); closeDesktop(); }}>
                  <Copy className="mr-2 h-3.5 w-3.5" />
                  Copiar texto
                </DropdownMenuItem>
                {isOwn && onEdit && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => { setEditContent(message.content); setIsEditing(true); closeDesktop(); }}>
                      <Pencil className="mr-2 h-3.5 w-3.5" />
                      Editar mensaje
                    </DropdownMenuItem>
                  </>
                )}
                {(isOwn || canDeleteAny) && onDelete && (
                  <DropdownMenuItem
                    onClick={() => { onDelete(message.id); closeDesktop(); }}
                    className="text-red-400 focus:text-red-400"
                  >
                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                    Eliminar mensaje
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          }
        />
      )}

      {/* Mobile: floating reaction menu (long-press) */}
      {showMobileMenu && channelId && (
        <ChatReactionBar
          mode="longpress"
          messageRef={messageRowRef}
          onReact={(emoji) => { handleReaction(emoji); closeMobile(); }}
          onReply={() => { onReply(); closeMobile(); }}
          onThread={onOpenThread ? () => { onOpenThread(message.id); closeMobile(); } : undefined}
          onCopy={() => { navigator.clipboard.writeText(message.content); closeMobile(); }}
          onClose={closeMobile}
        />
      )}
    </div>
  );
}
