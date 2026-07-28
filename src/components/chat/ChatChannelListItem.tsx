"use client";

import { Archive, ArchiveRestore, MoreHorizontal, Trash2, Bell, BellOff, AtSign, CheckCheck, Link2, Unlink } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatChannelData } from "@/lib/chat-types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type NotifPreference = "ALL" | "MENTIONS_ONLY" | "MUTED";

interface ChatChannelListItemProps {
  channel: ChatChannelData;
  isSelected: boolean;
  unreadCount: number;
  /** Si la última actividad incluye una mención al usuario */
  hasMention?: boolean;
  /** Nombres de personas escribiendo en este canal en este momento */
  typingNames?: string[];
  /** Preferencia actual de notificación, si la conocemos */
  notifPreference?: NotifPreference;
  /** Dos canales de la misma sección resuelven el mismo displayName */
  ambiguous?: boolean;
  onClick: () => void;
  onArchive?: () => void;
  onUnarchive?: () => void;
  onDelete?: () => void;
  onMarkAsRead?: () => void;
  onChangeNotifPreference?: (pref: NotifPreference) => void;
  canDelete?: boolean;
  isArchived?: boolean;
  /** Viewer admin + workspace Slack activo (gate cosmético; el API manda) */
  canManageSlack?: boolean;
  /** Nombre del canal de Slack puenteado, si lo hay */
  slackBridgeName?: string | null;
  onSlackConnect?: () => void;
  onSlackDisconnect?: () => void;
}

export function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  if (diffMs < 0) return "";
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
  ) return "ayer";

  const day = date.getDate();
  const months = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
  const month = months[date.getMonth()];
  if (date.getFullYear() === now.getFullYear()) return `${day} ${month}`;
  return `${day} ${month} ${date.getFullYear()}`;
}

function stripHtml(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

export function getChannelDisplayName(channel: Pick<
  ChatChannelData,
  "channelType" | "name" | "installation" | "dmParticipant" | "account"
>): string {
  if (channel.channelType === "DIRECT" && channel.dmParticipant) {
    return channel.dmParticipant.name;
  }
  if (channel.channelType === "EXTERNAL" && channel.account) {
    return channel.account.name;
  }
  if (channel.channelType === "INSTALLATION") {
    return channel.installation?.name ?? channel.name;
  }
  return channel.name;
}

function avatarClasses(channel: ChatChannelData): string {
  if (channel.channelType === "INSTALLATION") {
    return "bg-tint-violet text-tint-violet-fg";
  }
  if (channel.channelType === "DIRECT") {
    return "bg-tint-teal text-tint-teal-fg";
  }
  if (channel.channelType === "GROUP") {
    return "bg-tint-amber text-tint-amber-fg";
  }
  // EXTERNAL
  if (channel.account?.status === "prospect") {
    return "bg-tint-emerald text-tint-emerald-fg";
  }
  return "bg-tint-sky text-tint-sky-fg";
}

function accountStatusLabel(status: string | undefined): string | null {
  if (!status) return null;
  if (status === "prospect") return "Prospecto";
  if (status === "client_active" || status === "client") return "Cliente";
  return null;
}

export function ChatChannelListItem({
  channel,
  isSelected,
  unreadCount,
  hasMention = false,
  typingNames = [],
  notifPreference,
  ambiguous = false,
  onClick,
  onArchive,
  onUnarchive,
  onDelete,
  onMarkAsRead,
  onChangeNotifPreference,
  canDelete,
  isArchived,
  canManageSlack,
  slackBridgeName,
  onSlackConnect,
  onSlackDisconnect,
}: ChatChannelListItemProps) {
  const hasUnread = unreadCount > 0;
  const isDm = channel.channelType === "DIRECT";
  const canSlack = Boolean(canManageSlack) && !isDm;
  const isMuted = notifPreference === "MUTED";
  const isMentionsOnly = notifPreference === "MENTIONS_ONLY";

  const displayName = getChannelDisplayName(channel);

  let contextPrefix: string | null = null;
  if (channel.channelType === "INSTALLATION") {
    contextPrefix = channel.installation?.account?.name ?? null;
  } else if (channel.channelType === "EXTERNAL") {
    contextPrefix = accountStatusLabel(channel.account?.status);
  }

  const plainPreview = stripHtml(channel.lastMessagePreview);
  const senderPrefix =
    channel.lastMessageSenderName && plainPreview
      ? `${channel.lastMessageSenderName}: `
      : "";

  const previewLine =
    typingNames.length > 0
      ? typingNames.length === 1
        ? `${typingNames[0]} está escribiendo…`
        : `${typingNames.length} personas escribiendo…`
      : (() => {
          const body = plainPreview
            ? `${senderPrefix}${plainPreview}`
            : hasUnread
              ? "Mensajes nuevos"
              : "Sin mensajes";
          if (contextPrefix && (plainPreview || channel.lastMessageSenderName)) {
            return `${contextPrefix} · ${body}`;
          }
          if (contextPrefix && !plainPreview && !hasUnread) {
            return `${contextPrefix} · Sin mensajes`;
          }
          return body;
        })();

  const timestamp = formatRelativeTime(channel.lastMessageAt ?? null);
  const groupColor =
    channel.channelType === "GROUP" && channel.group?.color
      ? channel.group.color
      : undefined;

  return (
    <div className="relative group">
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "w-full flex items-center gap-3 px-3 h-[60px] text-left rounded-xl transition-colors duration-150",
          isSelected
            ? "bg-status-info-soft border-l-[2.5px] border-l-status-info pl-[9.5px]"
            : "hover:bg-ds-surface-2 active:bg-ds-surface-3 border-l-[2.5px] border-l-transparent",
        )}
      >
        {/* Avatar tipado */}
        <div
          className={cn(
            "shrink-0 flex h-[34px] w-[34px] items-center justify-center rounded-[10px] text-[13px] font-bold",
            groupColor ? "text-primary-foreground" : avatarClasses(channel),
          )}
          style={groupColor ? { backgroundColor: groupColor } : undefined}
        >
          {displayName.charAt(0).toUpperCase()}
        </div>

        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className={cn(
                "text-[13px] truncate min-w-0",
                hasUnread
                  ? "font-semibold text-ds-text-1"
                  : "font-normal text-ds-text-2"
              )}
            >
              {displayName}
            </span>
            {ambiguous && channel.channelType === "INSTALLATION" && (
              <span className="shrink-0 rounded-md bg-ds-surface-3 px-1.5 py-0.5 text-[12px] font-medium text-ds-text-3">
                {channel.subType ?? "sin tipo"}
              </span>
            )}
            {slackBridgeName && (
              <span title="Conectado con Slack" className="shrink-0 inline-flex">
                <Link2 className="h-3 w-3 text-ds-text-4" />
              </span>
            )}
            {isMuted && <BellOff className="h-3 w-3 shrink-0 text-ds-text-4" />}
            {isMentionsOnly && !isMuted && (
              <AtSign className="h-3 w-3 shrink-0 text-status-warn-fg" />
            )}
            {timestamp && (
              <span
                className={cn(
                  "ml-auto text-[12px] shrink-0 tabular-nums",
                  hasUnread ? "text-status-info-fg font-medium" : "text-ds-text-4"
                )}
              >
                {timestamp}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={cn(
                "text-[12px] truncate flex-1 min-w-0 leading-snug",
                typingNames.length > 0
                  ? "italic text-status-info-fg"
                  : hasUnread
                    ? "text-ds-text-2"
                    : "text-ds-text-3"
              )}
            >
              {previewLine}
            </span>
            {hasUnread && (
              <span
                className={cn(
                  "shrink-0 text-[12px] font-bold rounded-full min-w-[20px] h-[20px] flex items-center justify-center px-1.5",
                  hasMention
                    ? "bg-status-warn text-ds-text-1"
                    : "bg-status-info text-primary-foreground"
                )}
                aria-label={hasMention ? `${unreadCount} mención(es)` : `${unreadCount} no leídos`}
              >
                {hasMention ? "@" : unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </div>
        </div>
      </button>

      <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex h-11 w-11 items-center justify-center rounded-full text-ds-text-3 hover:bg-ds-surface-3 hover:text-ds-text-1 transition-colors"
              onClick={(e) => e.stopPropagation()}
              aria-label="Opciones de canal"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 z-[200]">
            {onChangeNotifPreference && (
              <>
                <DropdownMenuItem
                  onClick={(e) => { e.stopPropagation(); onChangeNotifPreference("ALL"); }}
                  className={cn(notifPreference === "ALL" && "bg-accent")}
                >
                  <Bell className="mr-2 h-4 w-4" />
                  Notificar todo
                  {notifPreference === "ALL" && <span className="ml-auto text-xs">✓</span>}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => { e.stopPropagation(); onChangeNotifPreference("MENTIONS_ONLY"); }}
                  className={cn(notifPreference === "MENTIONS_ONLY" && "bg-accent")}
                >
                  <AtSign className="mr-2 h-4 w-4" />
                  Solo menciones
                  {notifPreference === "MENTIONS_ONLY" && <span className="ml-auto text-xs">✓</span>}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => { e.stopPropagation(); onChangeNotifPreference("MUTED"); }}
                  className={cn(notifPreference === "MUTED" && "bg-accent")}
                >
                  <BellOff className="mr-2 h-4 w-4" />
                  Silenciar canal
                  {notifPreference === "MUTED" && <span className="ml-auto text-xs">✓</span>}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            {hasUnread && onMarkAsRead && (
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onMarkAsRead(); }}>
                <CheckCheck className="mr-2 h-4 w-4" />
                Marcar como leído
              </DropdownMenuItem>
            )}
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
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={(e) => { e.stopPropagation(); onDelete(); }}
                  className="text-status-danger-fg focus:text-status-danger-fg"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Eliminar
                </DropdownMenuItem>
              </>
            )}
            {canSlack && (
              <>
                <DropdownMenuSeparator />
                {slackBridgeName ? (
                  <>
                    <div className="px-2 py-1 text-[12px] text-muted-foreground flex items-center gap-1.5">
                      <Link2 className="h-3 w-3 shrink-0" />
                      <span className="truncate">Conectado con #{slackBridgeName}</span>
                    </div>
                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onSlackDisconnect?.(); }}>
                      <Unlink className="mr-2 h-4 w-4" />
                      Desconectar de Slack
                    </DropdownMenuItem>
                  </>
                ) : (
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onSlackConnect?.(); }}>
                    <Link2 className="mr-2 h-4 w-4" />
                    Vincular con Slack
                  </DropdownMenuItem>
                )}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
