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

  const isDm = channel.channelType === "DIRECT";

  return (
    <div className="relative group">
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "w-full flex items-center gap-2.5 px-3 py-1.5 md:py-1.5 h-14 md:h-auto text-left rounded-md transition-colors duration-150",
          isSelected
            ? "bg-[rgba(45,212,191,0.08)]"
            : "hover:bg-[rgba(255,255,255,0.04)]",
        )}
      >
        {/* Channel prefix: avatar for DMs, # for channels */}
        {isDm ? (
          <div
            className="shrink-0 flex h-7 w-7 items-center justify-center rounded-full text-white text-[10px] font-bold"
            style={{ backgroundColor: "#0d9488" }}
          >
            {(channel.dmParticipant?.name ?? channel.name).charAt(0).toUpperCase()}
          </div>
        ) : (
          <span
            className={cn(
              "text-sm shrink-0",
              isSelected
                ? "text-[#2dd4bf]"
                : "text-[rgba(255,255,255,0.28)]"
            )}
          >
            #
          </span>
        )}

        {/* Channel name */}
        <span
          className={cn(
            "text-[13px] truncate flex-1 min-w-0",
            hasUnread
              ? "font-semibold text-[rgba(255,255,255,0.88)]"
              : "font-normal text-[rgba(255,255,255,0.52)]"
          )}
        >
          {channel.channelType === "DIRECT" && channel.dmParticipant
            ? channel.dmParticipant.name
            : channel.channelType === "EXTERNAL" && channel.account
              ? channel.account.name
              : channel.name}
        </span>

        {/* Unread badge */}
        {hasUnread && (
          <span className="ml-auto shrink-0 bg-[#2dd4bf] text-zinc-900 text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
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
                  className="text-status-danger-fg focus:text-status-danger-fg"
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
