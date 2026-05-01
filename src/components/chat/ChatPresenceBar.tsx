"use client";

import { useState, useRef, useEffect, type ReactNode } from "react";
import { ArrowLeft, Bell, BellOff, AtSign, Search, X, Users, MoreHorizontal, Trash2 } from "lucide-react";
import { useSwipeGesture } from "./hooks/useSwipeGesture";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import type { PresenceMember } from "./hooks/useChatChannel";

type NotifPreference = "ALL" | "MENTIONS_ONLY" | "MUTED";

interface ChatPresenceBarProps {
  channelName: string;
  onlineCount: number;
  members?: PresenceMember[];
  onBack: () => void;
  onSearch?: (query: string) => void;
  isSearching?: boolean;
  channelId?: string;
  /** En móvil: swipe down en el header para cerrar (ej. panel flotante) */
  onSwipeDownToClose?: () => void;
  onClearMessages?: () => void;
  onCloseChat?: () => void;
  children?: ReactNode;
}

export function ChatPresenceBar({
  channelName,
  onlineCount,
  members = [],
  onBack,
  onSearch,
  isSearching,
  channelId,
  onSwipeDownToClose,
  onClearMessages,
  onCloseChat,
  children,
}: ChatPresenceBarProps) {
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [notifPref, setNotifPref] = useState<NotifPreference>("ALL");

  const swipeDown = useSwipeGesture({
    onSwipeDown: () => onSwipeDownToClose?.(),
    mobileOnly: true,
  });

  // Fetch current preference when channel changes
  useEffect(() => {
    if (!channelId) return;
    fetch(`/api/chat/channels/${channelId}/notification-preference`)
      .then((r) => r.ok ? r.json() : null)
      .then((j) => { if (j?.success) setNotifPref(j.data.preference as NotifPreference); })
      .catch(() => {});
  }, [channelId]);

  const updatePref = async (pref: NotifPreference) => {
    if (!channelId) return;
    setNotifPref(pref); // optimistic
    try {
      await fetch(`/api/chat/channels/${channelId}/notification-preference`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preference: pref }),
      });
    } catch {
      // revert on error
      fetch(`/api/chat/channels/${channelId}/notification-preference`)
        .then((r) => r.json())
        .then((j) => { if (j?.success) setNotifPref(j.data.preference); })
        .catch(() => {});
    }
  };

  const BellIcon = notifPref === "MUTED" ? BellOff : notifPref === "MENTIONS_ONLY" ? AtSign : Bell;

  return (
    <>
      <div
        className={cn(
          "shrink-0 flex flex-col border-b border-[rgba(255,255,255,0.06)] bg-[#0d1220] opai-chat-mobile-topbar opai-ios-surface-sheet-top",
          onSwipeDownToClose && "xl:flex-row xl:items-center"
        )}
        {...(onSwipeDownToClose ? swipeDown : {})}
      >
        {onSwipeDownToClose && (
          <div className="flex justify-center pt-2 pb-1 xl:hidden">
            <div className="w-10 h-1 rounded-full bg-[rgba(255,255,255,0.2)]" aria-hidden />
          </div>
        )}
        <div className="flex items-center justify-between h-14 px-4 pb-2 xl:pb-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={onBack}
              className="shrink-0 flex h-9 w-9 items-center justify-center rounded-full text-zinc-300 hover:bg-white/10 hover:text-zinc-100 transition-colors"
              aria-label="Volver a canales"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>

            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-status-info text-sm font-black text-zinc-950 shadow-inner shadow-white/20 xl:hidden">
              {channelName.charAt(0).toUpperCase()}
            </div>

            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-[rgba(255,255,255,0.88)] truncate">
                <span className="text-[#2dd4bf]">#</span> {channelName}
              </h3>
              {onlineCount > 0 && (
                <p className="mt-0.5 text-[11px] text-white/45 xl:hidden">
                  {onlineCount} en línea
                </p>
              )}
            </div>
          </div>

        <div className="flex items-center gap-1 shrink-0 xl:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-300 transition-colors hover:bg-white/10 hover:text-zinc-100"
                aria-label="Más opciones"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="z-[200] w-56 opai-ios-surface-popover">
              {onSearch && (
                <DropdownMenuItem
                  onClick={() => {
                    setShowSearch((open) => {
                      const next = !open;
                      if (next) {
                        setTimeout(() => searchInputRef.current?.focus(), 100);
                      } else {
                        setSearchQuery("");
                        onSearch("");
                      }
                      return next;
                    });
                  }}
                >
                  <Search className="mr-2 h-3.5 w-3.5" />
                  {showSearch ? "Cerrar busqueda" : "Buscar mensajes"}
                </DropdownMenuItem>
              )}
              {channelId && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => updatePref("ALL")} className={cn(notifPref === "ALL" && "bg-accent")}>
                    <Bell className="mr-2 h-3.5 w-3.5" />
                    Notificar todo
                    {notifPref === "ALL" && <span className="ml-auto text-xs text-status-info-fg">✓</span>}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => updatePref("MENTIONS_ONLY")} className={cn(notifPref === "MENTIONS_ONLY" && "bg-accent")}>
                    <AtSign className="mr-2 h-3.5 w-3.5" />
                    Solo menciones
                    {notifPref === "MENTIONS_ONLY" && <span className="ml-auto text-xs text-status-info-fg">✓</span>}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => updatePref("MUTED")} className={cn(notifPref === "MUTED" && "bg-accent")}>
                    <BellOff className="mr-2 h-3.5 w-3.5" />
                    Silenciar
                    {notifPref === "MUTED" && <span className="ml-auto text-xs text-status-info-fg">✓</span>}
                  </DropdownMenuItem>
                </>
              )}
              {(onClearMessages || onCloseChat) && (
                <>
                  <DropdownMenuSeparator />
                  {onClearMessages && (
                    <DropdownMenuItem
                      onClick={onClearMessages}
                      className="text-status-danger-fg focus:text-status-danger-fg"
                    >
                      <Trash2 className="mr-2 h-3.5 w-3.5" />
                      Limpiar conversación
                    </DropdownMenuItem>
                  )}
                  {onCloseChat && (
                    <DropdownMenuItem onClick={onCloseChat}>
                      <X className="mr-2 h-3.5 w-3.5" />
                      Cerrar chat
                    </DropdownMenuItem>
                  )}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="hidden items-center gap-1 shrink-0 xl:flex">
          {/* Extra actions (e.g. clear conversation) */}
          {children}

          {/* Search button */}
          {onSearch && (
            <button
              type="button"
              onClick={() => {
                setShowSearch(!showSearch);
                if (!showSearch) {
                  setTimeout(() => searchInputRef.current?.focus(), 100);
                } else {
                  setSearchQuery("");
                  onSearch("");
                }
              }}
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-full transition-colors",
                showSearch
                  ? "bg-zinc-700 text-zinc-200"
                  : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              )}
              aria-label="Buscar mensajes"
            >
              <Search className="h-4 w-4" />
            </button>
          )}

          {/* Notification preference */}
          {channelId && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-full transition-colors",
                    notifPref === "MUTED"
                      ? "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-400"
                      : notifPref === "MENTIONS_ONLY"
                        ? "text-status-warn-fg hover:bg-zinc-800"
                        : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                  )}
                  title="Configurar notificaciones"
                >
                  <BellIcon className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 z-[200]">
                <DropdownMenuItem
                  onClick={() => updatePref("ALL")}
                  className={cn(notifPref === "ALL" && "bg-accent")}
                >
                  <Bell className="mr-2 h-3.5 w-3.5" />
                  <span>Notificar todo</span>
                  {notifPref === "ALL" && <span className="ml-auto text-xs text-status-info-fg">✓</span>}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => updatePref("MENTIONS_ONLY")}
                  className={cn(notifPref === "MENTIONS_ONLY" && "bg-accent")}
                >
                  <AtSign className="mr-2 h-3.5 w-3.5" />
                  <span>Solo menciones</span>
                  {notifPref === "MENTIONS_ONLY" && <span className="ml-auto text-xs text-status-info-fg">✓</span>}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => updatePref("MUTED")}
                  className={cn(notifPref === "MUTED" && "bg-accent")}
                >
                  <BellOff className="mr-2 h-3.5 w-3.5" />
                  <span>Silenciar</span>
                  {notifPref === "MUTED" && <span className="ml-auto text-xs text-status-info-fg">✓</span>}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Online indicator with member popover */}
          {onlineCount > 0 && !showSearch && (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="hidden xl:flex items-center gap-1.5 ml-1 rounded-md px-2 py-1 hover:bg-zinc-800 transition-colors"
                  title="Ver usuarios en línea"
                >
                  <span className="h-2 w-2 rounded-full bg-[#22c55e]" />
                  <span className="text-xs text-[rgba(255,255,255,0.45)]">
                    {onlineCount} en línea
                  </span>
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                sideOffset={8}
                className="w-56 max-w-56 p-0 border-zinc-700/60 bg-[#0d1220]"
              >
                <div className="px-3 py-2 border-b border-zinc-700/40">
                  <p className="text-xs font-medium text-[rgba(255,255,255,0.6)] flex items-center gap-1.5">
                    <Users className="h-3 w-3" />
                    En línea ({members.length})
                  </p>
                </div>
                <div className="max-h-48 overflow-y-auto py-1">
                  {members.map((m) => (
                    <div key={m.id} className="flex items-center gap-2 px-3 py-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#22c55e] shrink-0" />
                      <span className="text-sm text-[rgba(255,255,255,0.85)] truncate flex-1">
                        {m.name}
                      </span>
                      <span
                        className={cn(
                          "text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0",
                          m.type === "ADMIN" && "bg-status-info-soft text-status-info-fg",
                          m.type === "GUARD" && "bg-status-ok-soft text-status-ok-fg",
                          m.type === "CLIENT" && "bg-status-warn-soft text-status-warn-fg",
                        )}
                      >
                        {m.type === "ADMIN" ? "Admin" : m.type === "GUARD" ? "Guardia" : "Cliente"}
                      </span>
                    </div>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
        </div>
      </div>

      {showSearch && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-[rgba(255,255,255,0.06)] bg-[#0d1220]/50">
          <Search className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              onSearch?.(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setShowSearch(false);
                setSearchQuery("");
                onSearch?.("");
              }
            }}
            placeholder="Buscar en este canal..."
            className="flex-1 bg-transparent text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                onSearch?.("");
              }}
              className="shrink-0 flex h-5 w-5 items-center justify-center rounded text-zinc-400 hover:text-zinc-200"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      )}
    </>
  );
}
