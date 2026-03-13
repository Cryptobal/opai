"use client";

import { useState, useRef, useEffect, type ReactNode } from "react";
import { ArrowLeft, Bell, BellOff, AtSign, Search, X, Users } from "lucide-react";
import { useSwipeGesture } from "./hooks/useSwipeGesture";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
          "shrink-0 flex flex-col border-b border-[rgba(255,255,255,0.06)] bg-[#0d1220]",
          onSwipeDownToClose && "lg:flex-row lg:items-center"
        )}
        {...(onSwipeDownToClose ? swipeDown : {})}
      >
        {onSwipeDownToClose && (
          <div className="flex justify-center pt-2 pb-1 lg:hidden">
            <div className="w-10 h-1 rounded-full bg-[rgba(255,255,255,0.2)]" aria-hidden />
          </div>
        )}
        <div className="flex items-center justify-between h-14 px-4 pb-2 lg:pb-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={onBack}
              className="shrink-0 flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
              aria-label="Volver a canales"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>

            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-[rgba(255,255,255,0.88)] truncate">
                <span className="text-[#2dd4bf]">#</span> {channelName}
              </h3>
            </div>
          </div>

        <div className="flex items-center gap-1 shrink-0">
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
                "flex h-8 w-8 items-center justify-center rounded-md transition-colors",
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
                    "flex h-8 w-8 items-center justify-center rounded-md transition-colors",
                    notifPref === "MUTED"
                      ? "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-400"
                      : notifPref === "MENTIONS_ONLY"
                        ? "text-amber-400 hover:bg-zinc-800"
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
                  {notifPref === "ALL" && <span className="ml-auto text-xs text-teal-400">✓</span>}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => updatePref("MENTIONS_ONLY")}
                  className={cn(notifPref === "MENTIONS_ONLY" && "bg-accent")}
                >
                  <AtSign className="mr-2 h-3.5 w-3.5" />
                  <span>Solo menciones</span>
                  {notifPref === "MENTIONS_ONLY" && <span className="ml-auto text-xs text-teal-400">✓</span>}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => updatePref("MUTED")}
                  className={cn(notifPref === "MUTED" && "bg-accent")}
                >
                  <BellOff className="mr-2 h-3.5 w-3.5" />
                  <span>Silenciar</span>
                  {notifPref === "MUTED" && <span className="ml-auto text-xs text-teal-400">✓</span>}
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
                  className="flex items-center gap-1.5 ml-1 rounded-md px-2 py-1 hover:bg-zinc-800 transition-colors"
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
                          m.type === "ADMIN" && "bg-blue-500/15 text-blue-400",
                          m.type === "GUARD" && "bg-emerald-500/15 text-emerald-400",
                          m.type === "CLIENT" && "bg-amber-500/15 text-amber-400",
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
