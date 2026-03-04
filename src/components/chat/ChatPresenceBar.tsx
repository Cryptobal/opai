"use client";

import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatPresenceBarProps {
  channelName: string;
  onlineCount: number;
  onBack: () => void;
}

/**
 * Top bar of the conversation panel.
 * Shows channel name (left), online count with green dot (right).
 * On mobile, includes a back button.
 */
export function ChatPresenceBar({
  channelName,
  onlineCount,
  onBack,
}: ChatPresenceBarProps) {
  return (
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

      {/* Online indicator */}
      {onlineCount > 0 && (
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          <span className="text-xs text-zinc-400">
            {onlineCount} {onlineCount === 1 ? "en linea" : "en linea"}
          </span>
        </div>
      )}
    </div>
  );
}
