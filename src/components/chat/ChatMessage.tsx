"use client";

import { useState, useRef, useCallback, type ReactNode } from "react";
import { Reply, MoreHorizontal, MessageSquare, Pencil, Trash2, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatMessageData, ChatSenderType } from "@/lib/chat-types";
import { ChatAttachmentPreview } from "./ChatAttachmentPreview";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ChatMessageProps {
  message: ChatMessageData;
  isOwn: boolean;
  onReply: () => void;
  onOpenThread?: (messageId: string) => void;
  onEdit?: (messageId: string, content: string) => void;
  onDelete?: (messageId: string) => void;
  channelId?: string;
  currentUserId?: string;
  readByCount?: number;
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
 * Single message bubble component.
 * Own messages: aligned right, blue tint.
 * Others: aligned left, zinc background.
 */
/**
 * Render message content with @mention highlighting.
 * Format: <@userId>Name</> or <@todos>
 */
function renderContent(content: string, currentUserId?: string): ReactNode {
  // Parse <@userId> patterns
  const parts = content.split(/(<@[^>]+>)/g);
  if (parts.length === 1) return content;

  return parts.map((part, i) => {
    const mentionMatch = part.match(/^<@([^>]+)>$/);
    if (!mentionMatch) return part;

    const token = mentionMatch[1];
    const isTodos = token === "todos";
    const isMe = !isTodos && token === currentUserId;

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
        @{isTodos ? "todos" : token}
      </span>
    );
  });
}

export function ChatMessage({ message, isOwn, onReply, onOpenThread, onEdit, onDelete, channelId, currentUserId, readByCount }: ChatMessageProps) {
  const [showActions, setShowActions] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [showMobileActions, setShowMobileActions] = useState(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleReaction = useCallback(async (emoji: string) => {
    if (!channelId) return;
    try {
      await fetch(`/api/chat/channels/${channelId}/messages/${message.id}/reactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji }),
      });
    } catch (err) {
      console.error("Error toggling reaction:", err);
    }
  }, [channelId, message.id]);

  return (
    <div
      className={cn(
        "group flex mb-1.5",
        isOwn ? "justify-end" : "justify-start"
      )}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
      onTouchStart={() => {
        longPressTimerRef.current = setTimeout(() => {
          setShowMobileActions(true);
        }, 500);
      }}
      onTouchEnd={() => {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
      }}
      onTouchMove={() => {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
      }}
    >
      <div className={cn("max-w-[75%] lg:max-w-[60%] relative")}>
        {/* Sender name (only for others) */}
        {!isOwn && (
          <p className={cn("text-xs font-medium mb-0.5 px-1", senderColor(message.senderType))}>
            {message.senderName}
          </p>
        )}

        {/* Message bubble */}
        <div
          className={cn(
            "rounded-xl px-3 py-2 text-sm leading-relaxed",
            isOwn
              ? "bg-blue-600/20 border border-blue-500/30 text-zinc-100"
              : "bg-zinc-800/50 border border-zinc-700/30 text-zinc-200"
          )}
        >
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

          {/* Content with mention highlighting */}
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
              className="break-words whitespace-pre-wrap chat-html-content"
              dangerouslySetInnerHTML={{ __html: message.contentHtml }}
            />
          ) : (
            <p className="break-words whitespace-pre-wrap">
              {renderContent(message.content, currentUserId)}
            </p>
          )}

          {/* Attachments */}
          {message.attachments && message.attachments.length > 0 && (
            <div className="mt-2">
              <ChatAttachmentPreview attachments={message.attachments} />
            </div>
          )}

          {/* Time + edited indicator */}
          <div
            className={cn(
              "flex items-center gap-1 mt-1",
              isOwn ? "justify-end" : "justify-start"
            )}
          >
            {message.isEdited && (
              <span className="text-[10px] text-zinc-500 italic">editado</span>
            )}
            <span className="text-[10px] text-zinc-500">
              {formatTime(message.createdAt)}
            </span>
            {isOwn && typeof readByCount === "number" && readByCount > 0 && (
              <span className="text-[10px] text-blue-400 ml-1" title={`Visto por ${readByCount}`}>
                ✓✓
              </span>
            )}
          </div>
        </div>

        {/* Reactions */}
        {message.reactions.length > 0 && (
          <div className={cn("flex flex-wrap gap-1 mt-1 px-1", isOwn ? "justify-end" : "justify-start")}>
            {message.reactions.map((reaction) => (
              <button
                key={reaction.emoji}
                type="button"
                onClick={() => handleReaction(reaction.emoji)}
                className={cn(
                  "inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-xs transition-colors",
                  reaction.senders.some(s => s.id === currentUserId)
                    ? "bg-blue-500/20 border-blue-500/30 hover:bg-blue-500/30"
                    : "bg-zinc-800 border-zinc-700 hover:bg-zinc-700"
                )}
                title={reaction.senders.map((s) => s.name).join(", ")}
              >
                <span>{reaction.emoji}</span>
                <span className="text-zinc-400">{reaction.count}</span>
              </button>
            ))}
          </div>
        )}

        {/* Thread indicator */}
        {(message as any).replyCount > 0 && onOpenThread && (
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
              {(message as any).replyCount} {(message as any).replyCount === 1 ? "respuesta" : "respuestas"}
            </span>
          </button>
        )}

        {/* Action bar (appears on hover) */}
        {showActions && (
          <div
            className={cn(
              "absolute -top-3 flex items-center gap-0.5 rounded-lg border border-zinc-700 bg-zinc-900 shadow-lg px-1 py-0.5",
              isOwn ? "right-0" : "left-0"
            )}
          >
            {/* Quick reactions */}
            {channelId && (
              <>
                {["👍", "❤️", "😂", "🎉", "👀"].map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => handleReaction(emoji)}
                    className="flex h-6 w-6 items-center justify-center rounded text-sm hover:bg-zinc-800 transition-colors"
                    title={emoji}
                  >
                    {emoji}
                  </button>
                ))}
                <div className="w-px h-4 bg-zinc-700 mx-0.5" />
              </>
            )}
            <button
              type="button"
              onClick={onReply}
              className="flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
              title="Responder"
            >
              <Reply className="h-3.5 w-3.5" />
            </button>
            {onOpenThread && (
              <button
                type="button"
                onClick={() => onOpenThread(message.id)}
                className="flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
                title="Abrir hilo"
              >
                <MessageSquare className="h-3.5 w-3.5" />
              </button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
                  title="Mas opciones"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align={isOwn ? "end" : "start"} className="w-44">
                {onOpenThread && (
                  <DropdownMenuItem onClick={() => onOpenThread(message.id)}>
                    <MessageSquare className="mr-2 h-3.5 w-3.5" />
                    Abrir hilo
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => {
                  navigator.clipboard.writeText(message.content);
                }}>
                  <Copy className="mr-2 h-3.5 w-3.5" />
                  Copiar texto
                </DropdownMenuItem>
                {isOwn && onEdit && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => {
                      setEditContent(message.content);
                      setIsEditing(true);
                    }}>
                      <Pencil className="mr-2 h-3.5 w-3.5" />
                      Editar mensaje
                    </DropdownMenuItem>
                  </>
                )}
                {isOwn && onDelete && (
                  <DropdownMenuItem
                    onClick={() => onDelete(message.id)}
                    className="text-red-400 focus:text-red-400"
                  >
                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                    Eliminar mensaje
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {/* Mobile action sheet (long-press) */}
      {showMobileActions && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/50"
            onClick={() => setShowMobileActions(false)}
          />
          {/* Action sheet */}
          <div className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl border-t border-zinc-700 bg-zinc-900 p-4 pb-8 animate-in slide-in-from-bottom">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-zinc-700" />
            <div className="space-y-1">
              <button type="button" onClick={() => { onReply(); setShowMobileActions(false); }} className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm text-zinc-200 hover:bg-zinc-800 transition-colors">
                <Reply className="h-4 w-4 text-zinc-400" /> Responder
              </button>
              {onOpenThread && (
                <button type="button" onClick={() => { onOpenThread(message.id); setShowMobileActions(false); }} className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm text-zinc-200 hover:bg-zinc-800 transition-colors">
                  <MessageSquare className="h-4 w-4 text-zinc-400" /> Abrir hilo
                </button>
              )}
              <button type="button" onClick={() => { navigator.clipboard.writeText(message.content); setShowMobileActions(false); }} className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm text-zinc-200 hover:bg-zinc-800 transition-colors">
                <Copy className="h-4 w-4 text-zinc-400" /> Copiar texto
              </button>
              {isOwn && onEdit && (
                <button type="button" onClick={() => { setEditContent(message.content); setIsEditing(true); setShowMobileActions(false); }} className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm text-zinc-200 hover:bg-zinc-800 transition-colors">
                  <Pencil className="h-4 w-4 text-zinc-400" /> Editar mensaje
                </button>
              )}
              {isOwn && onDelete && (
                <button type="button" onClick={() => { onDelete(message.id); setShowMobileActions(false); }} className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm text-red-400 hover:bg-zinc-800 transition-colors">
                  <Trash2 className="h-4 w-4" /> Eliminar mensaje
                </button>
              )}
              {channelId && (
                <div className="mt-2 pt-2 border-t border-zinc-800">
                  <p className="text-[10px] text-zinc-500 px-4 mb-1.5">Reaccionar</p>
                  <div className="flex items-center justify-around px-4">
                    {["👍", "❤️", "😂", "🎉", "👀"].map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => {
                          handleReaction(emoji);
                          setShowMobileActions(false);
                        }}
                        className="flex h-10 w-10 items-center justify-center rounded-xl text-xl hover:bg-zinc-800 transition-colors"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
