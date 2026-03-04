"use client";

import { useState, useRef } from "react";
import { ArrowLeft, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatPresenceBarProps {
  channelName: string;
  onlineCount: number;
  onBack: () => void;
  onSearch?: (query: string) => void;
  isSearching?: boolean;
}

/**
 * Top bar of the conversation panel.
 * Shows channel name (left), online count with green dot (right).
 * On mobile, includes a back button.
 * Optionally includes a collapsible search input.
 */
export function ChatPresenceBar({
  channelName,
  onlineCount,
  onBack,
  onSearch,
  isSearching,
}: ChatPresenceBarProps) {
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

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

        <div className="flex items-center gap-2 shrink-0">
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

          {/* Online indicator */}
          {onlineCount > 0 && !showSearch && (
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span className="text-xs text-zinc-400">
                {onlineCount} {onlineCount === 1 ? "en linea" : "en linea"}
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
