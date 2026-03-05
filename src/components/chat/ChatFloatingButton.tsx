"use client";

import { MessageCircle } from "lucide-react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useChatFloatingContext } from "./ChatFloatingProvider";

/**
 * Floating action button for chat — replaces NotesFloatingButton.
 * Shows unread badge from ALL channels (DIRECT, GROUP, INSTALLATION).
 */
export function ChatFloatingButton() {
  const ctx = useChatFloatingContext();
  const pathname = usePathname();

  // Don't show the button on the /chat page to avoid duplicate chat UI
  if (pathname.startsWith("/chat")) return null;

  return (
    <button
      type="button"
      onClick={ctx.togglePanel}
      className={cn(
        "hidden sm:fixed sm:flex z-[55] items-center justify-center rounded-full shadow-lg transition-all duration-200",
        "h-12 w-12 bg-teal-600 text-white hover:bg-teal-700 active:scale-95",
        "bottom-[calc(theme(spacing.14)+theme(spacing.4)+env(safe-area-inset-bottom))] right-4",
        "sm:bottom-6 sm:right-6",
        ctx.isPanelOpen && "pointer-events-none opacity-0 scale-75",
      )}
      aria-label="Abrir chat"
      title="Chat"
    >
      <MessageCircle className="h-5 w-5" />

      {ctx.totalUnread > 0 && (
        <span
          className={cn(
            "absolute -top-1 -right-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white",
          )}
        >
          {ctx.totalUnread > 99 ? "99+" : ctx.totalUnread}
        </span>
      )}
    </button>
  );
}
