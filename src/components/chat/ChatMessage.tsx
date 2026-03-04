"use client";

import { useState, type ReactNode } from "react";
import { Reply, MoreHorizontal, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatMessageData, ChatSenderType } from "@/lib/chat-types";
import { ChatAttachmentPreview } from "./ChatAttachmentPreview";

interface ChatMessageProps {
  message: ChatMessageData;
  isOwn: boolean;
  onReply: () => void;
  onOpenThread?: (messageId: string) => void;
  currentUserId?: string;
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

export function ChatMessage({ message, isOwn, onReply, onOpenThread, currentUserId }: ChatMessageProps) {
  const [showActions, setShowActions] = useState(false);

  return (
    <div
      className={cn(
        "group flex mb-1.5",
        isOwn ? "justify-end" : "justify-start"
      )}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
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
          {message.contentHtml ? (
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
          </div>
        </div>

        {/* Reactions */}
        {message.reactions.length > 0 && (
          <div className={cn("flex flex-wrap gap-1 mt-1 px-1", isOwn ? "justify-end" : "justify-start")}>
            {message.reactions.map((reaction) => (
              <button
                key={reaction.emoji}
                type="button"
                className="inline-flex items-center gap-0.5 rounded-full bg-zinc-800 border border-zinc-700 px-1.5 py-0.5 text-xs transition-colors hover:bg-zinc-700"
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
            <button
              type="button"
              className="flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
              title="Mas opciones"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
