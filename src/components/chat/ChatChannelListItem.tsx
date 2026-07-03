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
  ) return "ayer";

  const day = date.getDate();
  const months = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
  const month = months[date.getMonth()];
  if (date.getFullYear() === now.getFullYear()) return `${day} ${month}`;
  return `${day} ${month} ${date.getFullYear()}`;
}

function stripHtml(s: string | null | undefined): string {
  if (!s) return "";
  // El preview puede venir con HTML del editor Tiptap. Lo aplastamos a texto plano.
  return s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

export function ChatChannelListItem({
  channel,
  isSelected,
  unreadCount,
  hasMention = false,
  typingNames = [],
  notifPreference,
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

  const displayName =
    channel.channelType === "DIRECT" && channel.dmParticipant
      ? channel.dmParticipant.name
      : channel.channelType === "EXTERNAL" && channel.account
        ? channel.account.name
        : channel.name;

  const previewLine = typingNames.length > 0
    ? typingNames.length === 1
      ? `${typingNames[0]} está escribiendo…`
      : `${typingNames.length} personas escribiendo…`
    : stripHtml(channel.lastMessagePreview);

  const timestamp = formatRelativeTime(channel.lastMessageAt ?? null);

  return (
    <div className="relative group">
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "w-full flex items-start gap-3 px-3 py-2.5 text-left rounded-xl transition-colors duration-150",
          // Mínimo 56px de área táctil — iOS HIG
          "min-h-[56px]",
          isSelected
            ? "bg-[rgba(45,212,191,0.10)]"
            : "hover:bg-[rgba(255,255,255,0.04)] active:bg-[rgba(255,255,255,0.06)]",
        )}
      >
        {/* Avatar / prefijo */}
        {isDm ? (
          <div
            className="shrink-0 flex h-10 w-10 items-center justify-center rounded-full text-white text-sm font-bold"
            style={{ backgroundColor: "#0d9488" }}
          >
            {(channel.dmParticipant?.name ?? channel.name).charAt(0).toUpperCase()}
          </div>
        ) : (
          <div className="shrink-0 flex h-10 w-10 items-center justify-center rounded-full bg-[rgba(255,255,255,0.06)] text-[rgba(255,255,255,0.55)] text-base font-semibold">
            #
          </div>
        )}

        {/* Línea 1 (nombre + timestamp) y línea 2 (preview/typing) */}
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={cn(
                "text-sm truncate flex-1 min-w-0",
                hasUnread
                  ? "font-semibold text-[rgba(255,255,255,0.95)]"
                  : "font-normal text-[rgba(255,255,255,0.78)]"
              )}
            >
              {displayName}
            </span>
            {slackBridgeName && (
              <span title="Conectado con Slack" className="shrink-0 inline-flex">
                <Link2 className="h-3 w-3 text-[rgba(255,255,255,0.45)]" />
              </span>
            )}
            {isMuted && <BellOff className="h-3 w-3 shrink-0 text-[rgba(255,255,255,0.35)]" />}
            {isMentionsOnly && !isMuted && <AtSign className="h-3 w-3 shrink-0 text-amber-400/80" />}
            {timestamp && (
              <span
                className={cn(
                  "text-[11px] shrink-0 tabular-nums",
                  hasUnread ? "text-[#2dd4bf]" : "text-[rgba(255,255,255,0.40)]"
                )}
              >
                {timestamp}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={cn(
                "text-[12.5px] truncate flex-1 min-w-0 leading-snug",
                typingNames.length > 0
                  ? "italic text-[#2dd4bf]"
                  : hasUnread
                    ? "text-[rgba(255,255,255,0.78)]"
                    : "text-[rgba(255,255,255,0.45)]"
              )}
            >
              {previewLine || (hasUnread ? "Mensajes nuevos" : "Sin mensajes")}
            </span>
            {hasUnread && (
              <span
                className={cn(
                  "shrink-0 text-[10px] font-bold rounded-full min-w-[20px] h-[20px] flex items-center justify-center px-1.5",
                  hasMention
                    ? "bg-amber-400 text-zinc-900"
                    : "bg-[#2dd4bf] text-zinc-900"
                )}
                aria-label={hasMention ? `${unreadCount} mención(es)` : `${unreadCount} no leídos`}
              >
                {hasMention ? "@" : unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </div>
        </div>
      </button>

      {/* Menú contextual — visible siempre en touch (override global) */}
      <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex h-11 w-11 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
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
                    <div className="px-2 py-1 text-[11px] text-muted-foreground flex items-center gap-1.5">
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
