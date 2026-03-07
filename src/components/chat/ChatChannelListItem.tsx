"use client";

import { Archive, ArchiveRestore, MoreHorizontal, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatChannelData } from "@/lib/chat-types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ChatChannelListItemProps {
  channel: ChatChannelData;
  isSelected: boolean;
  unreadCount: number;
  onClick: () => void;
  onArchive?: () => void;
  onUnarchive?: () => void;
  onDelete?: () => void;
  canDelete?: boolean;
  isArchived?: boolean;
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return "";

  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);

  if (diffSec < 60) return "ahora";
  if (diffMin < 60) return `${diffMin}m`;
  if (diffHour < 24) return `${diffHour}h`;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear()
  ) {
    return "ayer";
  }

  const day = date.getDate();
  const months = [
    "ene", "feb", "mar", "abr", "may", "jun",
    "jul", "ago", "sep", "oct", "nov", "dic",
  ];
  const month = months[date.getMonth()];

  if (date.getFullYear() === now.getFullYear()) {
    return `${day} ${month}`;
  }
  return `${day} ${month} ${date.getFullYear()}`;
}

export function ChatChannelListItem({
  channel,
  isSelected,
  unreadCount,
  onClick,
  onArchive,
  onUnarchive,
  onDelete,
  canDelete,
  isArchived,
}: ChatChannelListItemProps) {
  const hasUnread = unreadCount > 0;
  const hasMenu = onArchive || onUnarchive || (onDelete && canDelete);

  return (
    <div className="relative group">
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "w-full flex items-start gap-3 px-4 py-3 text-left transition-colors duration-150",
          isSelected
            ? "bg-zinc-800"
            : "hover:bg-zinc-800/50",
        )}
      >
        {/* Channel avatar */}
        <div
          className="shrink-0 mt-0.5 flex h-9 w-9 items-center justify-center rounded-full text-white text-xs font-bold"
          style={{
            backgroundColor:
              channel.channelType === "DIRECT"
                ? "#0d9488" // teal-600
                : channel.channelType === "GROUP"
                  ? channel.group?.color || "#6B7280"
                  : channel.channelType === "INSTALLATION"
                    ? "#4f46e5" // indigo-600
                    : channel.channelType === "EXTERNAL"
                      ? "#7c3aed" // violet-600
                      : "#6B7280",
          }}
        >
          {channel.channelType === "DIRECT"
            ? (channel.dmParticipant?.name ?? channel.name).charAt(0).toUpperCase()
            : channel.channelType === "EXTERNAL"
              ? (channel.account?.name ?? channel.name).slice(0, 2).toUpperCase()
              : channel.name.slice(0, 2).toUpperCase()}
        </div>

        {/* Channel info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span
              className={cn(
                "text-sm truncate",
                hasUnread ? "font-semibold text-zinc-100" : "font-medium text-zinc-300"
              )}
            >
              {channel.channelType === "DIRECT" && channel.dmParticipant
                ? channel.dmParticipant.name
                : channel.channelType === "EXTERNAL" && channel.account
                  ? channel.account.name
                  : channel.name}
            </span>
            <span className="shrink-0 text-xs text-zinc-500">
              {formatRelativeTime(channel.lastMessageAt)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2 mt-0.5">
            <p
              className={cn(
                "text-xs truncate",
                hasUnread ? "text-zinc-300" : "text-zinc-500"
              )}
            >
              {channel.lastMessagePreview || "Sin mensajes"}
            </p>
            {hasUnread && (
              <span className="shrink-0 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-teal-600 px-1.5 text-[10px] font-bold text-white">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </div>
        </div>
      </button>

      {/* Context menu (visible on hover) */}
      {hasMenu && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex h-7 w-7 items-center justify-center rounded-md bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44 z-[200]">
              {!isArchived && onArchive && (
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onArchive(); }}>
                  <Archive className="mr-2 h-4 w-4" />
                  Archivar
                </DropdownMenuItem>
              )}
              {isArchived && onUnarchive && (
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onUnarchive(); }}>
                  <ArchiveRestore className="mr-2 h-4 w-4" />
                  Desarchivar
                </DropdownMenuItem>
              )}
              {canDelete && onDelete && (
                <DropdownMenuItem
                  onClick={(e) => { e.stopPropagation(); onDelete(); }}
                  className="text-red-400 focus:text-red-400"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Eliminar
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}
