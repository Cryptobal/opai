"use client";

import { MessageSquareText } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNotesContext } from "./NotesProvider";

/**
 * NotesFloatingButton — Circular FAB that opens the notes panel.
 *
 * - Bottom-right corner, above mobile BottomNav (z-40, h-14).
 * - Badge shows unread count (pulses when there are unread mentions).
 * - Click toggles the panel open/close.
 */
export function NotesFloatingButton() {
  const ctx = useNotesContext();

  return (
    <button
      type="button"
      onClick={ctx.togglePanel}
      className={cn(
        "fixed z-[55] flex items-center justify-center rounded-full shadow-lg transition-all duration-200",
        // Size & color
        "h-12 w-12 bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95",
        // Position: above BottomNav on mobile (bottom-0 + h-14 + gap), normal on desktop
        "bottom-[calc(theme(spacing.14)+theme(spacing.4)+env(safe-area-inset-bottom))] right-4",
        "sm:bottom-6 sm:right-6",
        // Hide when panel is open
        ctx.isPanelOpen && "pointer-events-none opacity-0 scale-75",
      )}
      aria-label="Abrir notas"
      title="Notas"
    >
      <MessageSquareText className="h-5 w-5" />

      {/* Unread badge */}
      {ctx.unreadCount > 0 && (
        <span
          className={cn(
            "absolute -top-1 -right-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground",
            // Pulse animation when there are unread mentions
            ctx.hasUnreadMentions && "animate-pulse",
          )}
        >
          {ctx.unreadCount > 99 ? "99+" : ctx.unreadCount}
        </span>
      )}
    </button>
  );
}
