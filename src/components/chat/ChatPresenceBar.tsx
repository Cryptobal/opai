"use client";

import { useState, useRef, useEffect, type ReactNode } from "react";
import { ArrowLeft, Bell, BellOff, AtSign, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type NotifPreference = "ALL" | "MENTIONS_ONLY" | "MUTED";

interface ChatPresenceBarProps {
  channelName: string;
  onlineCount: number;
  onBack: () => void;
  onSearch?: (query: string) => void;
  isSearching?: boolean;
  channelId?: string;
  children?: ReactNode;
}

export function ChatPresenceBar({
  channelName,
  onlineCount,
  onBack,
  onSearch,
  isSearching,
  channelId,
  children,
}: ChatPresenceBarProps) {
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [notifPref, setNotifPref] = useState<NotifPreference>("ALL");

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
      <div className="shrink-0 flex items-center justify-between h-14 px-4 border-b border-zinc-800 bg-zinc-900/50">
        <div className="flex items-center gap-3 min-w-0">
          {/* Back button (mobile only) */}
          <button
            type="button"
            onClick={onBack}
            className="lg:hidden shrink-0 flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
            aria-label="Volver a canales"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>

          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-zinc-100 truncate">
              {channelName}
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

          {/* Online indicator */}
          {onlineCount > 0 && !showSearch && (
            <div className="flex items-center gap-1.5 ml-1">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span className="text-xs text-zinc-400">
                {onlineCount} en línea
              </span>
            </div>
          )}
        </div>
      </div>

      {showSearch && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800 bg-zinc-900/30">
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
