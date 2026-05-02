"use client";

import { type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { ChatMessageData, ChatSenderType } from "@/lib/chat-types";

interface ChatSlackMessageProps {
  message: ChatMessageData;
  isFirstInGroup: boolean;
  senderColorClass?: string;
  renderContent?: (content: string) => ReactNode;
  children?: ReactNode;
}

function defaultSenderColor(type: ChatSenderType): string {
  switch (type) {
    case "ADMIN": return "text-status-info-fg";
    case "GUARD": return "text-status-ok-fg";
    case "CLIENT": return "text-status-warn-fg";
    default: return "text-zinc-400";
  }
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/**
 * Slack-style message component — full-width, no bubbles.
 * Used by main OPAI chat AND all portal chat sections.
 */
export function ChatSlackMessage({
  message,
  isFirstInGroup,
  senderColorClass,
  renderContent,
  children,
}: ChatSlackMessageProps) {
  const colorClass = senderColorClass || defaultSenderColor(message.senderType);
  const time = formatTime(message.createdAt);

  if (!isFirstInGroup) {
    // Grouped message: just text with indent, timestamp on hover
    return (
      <div className="group relative flex items-start hover:bg-[rgba(255,255,255,0.04)] px-4 py-0.5 transition-colors duration-100">
        {/* Hover timestamp in the avatar column */}
        <span className="w-9 shrink-0 mr-3 text-[11px] text-[rgba(255,255,255,0.28)] opacity-0 group-hover:opacity-100 transition-opacity text-right pt-0.5 select-none">
          {time}
        </span>
        <div className="min-w-0 flex-1">
          {/* Reply quote */}
          {message.replyTo && (
            <div className="border-l-2 border-zinc-600 pl-2 mb-1 py-0.5">
              <p className="text-xs font-medium text-zinc-400">{message.replyTo.senderName}</p>
              <p className="text-xs text-zinc-500 line-clamp-1">{message.replyTo.content}</p>
            </div>
          )}
          <div
            className="text-sm text-[rgba(255,255,255,0.88)] leading-[1.55] break-words whitespace-pre-wrap select-none"
            style={{ WebkitUserSelect: "none", userSelect: "none" as const, WebkitTouchCallout: "none" as const }}
          >
            {renderContent ? renderContent(message.content) : message.content}
          </div>
          {message.isEdited && (
            <span className="text-[10px] text-zinc-500 italic ml-1">(editado)</span>
          )}
          {children}
        </div>
      </div>
    );
  }

  // First message in group: full layout with avatar + name + timestamp
  return (
    <div className="group relative flex items-start hover:bg-[rgba(255,255,255,0.04)] px-4 pt-2 pb-0.5 transition-colors duration-100">
      {/* Avatar */}
      <div className="w-9 h-9 shrink-0 mr-3 rounded-lg bg-zinc-700 flex items-center justify-center overflow-hidden">
        {message.senderAvatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={message.senderAvatar} alt={message.senderName} className="w-full h-full object-cover" />
        ) : (
          <span className="text-xs font-bold text-zinc-300">{getInitials(message.senderName)}</span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        {/* Name + timestamp line */}
        <div className="flex items-baseline gap-2">
          <span className={cn("text-sm font-bold", colorClass)}>
            {message.senderName}
          </span>
          <span className="text-[11px] text-[rgba(255,255,255,0.28)]">
            {time}
          </span>
        </div>

        {/* Reply quote */}
        {message.replyTo && (
          <div className="border-l-2 border-zinc-600 pl-2 mb-1 mt-0.5 py-0.5">
            <p className="text-xs font-medium text-zinc-400">{message.replyTo.senderName}</p>
            <p className="text-xs text-zinc-500 line-clamp-1">{message.replyTo.content}</p>
          </div>
        )}

        {/* Content */}
        <div
          className="text-sm text-[rgba(255,255,255,0.88)] leading-[1.55] break-words whitespace-pre-wrap select-none"
          style={{ WebkitUserSelect: "none", userSelect: "none" as const, WebkitTouchCallout: "none" as const }}
        >
          {renderContent ? renderContent(message.content) : message.content}
        </div>
        {message.isEdited && (
          <span className="text-[10px] text-zinc-500 italic ml-1">(editado)</span>
        )}

        {/* Slot for attachments, reactions, thread indicator, etc. */}
        {children}
      </div>
    </div>
  );
}
