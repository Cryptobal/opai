"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { Reply, MessageSquare, Copy } from "lucide-react";

const QUICK_EMOJIS_DESKTOP = ["👍", "✅", "👀", "🎉"];
const QUICK_EMOJIS_MOBILE = ["👍", "✅", "👀", "🎉", "❤️"];

interface ChatReactionBarProps {
  mode: "hover" | "longpress";
  onReact: (emoji: string) => void;
  onReply: () => void;
  onThread?: () => void;
  onCopy?: () => void;
  onClose: () => void;
  /** Slot for a custom "more" element (e.g. DropdownMenu) rendered at the end of the hover bar */
  moreSlot?: ReactNode;
  /** Ref to the message row, used to position the mobile menu */
  messageRef?: RefObject<HTMLDivElement | null>;
}

export function ChatReactionBar({
  mode,
  onReact,
  onReply,
  onThread,
  onCopy,
  onClose,
  moreSlot,
  messageRef,
}: ChatReactionBarProps) {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (mode !== "longpress") return;
    const handler = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
    };
  }, [mode, onClose]);

  if (mode === "hover") {
    return (
      <div
        ref={barRef}
        className="absolute right-4 -top-4 z-10 flex items-center gap-0.5 rounded-lg px-1 py-0.5 animate-in fade-in zoom-in-95 duration-150"
        style={{
          backgroundColor: "#0d1220",
          border: "1px solid rgba(255,255,255,0.06)",
          boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
        }}
      >
        {QUICK_EMOJIS_DESKTOP.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => onReact(emoji)}
            className="flex h-7 w-7 items-center justify-center rounded text-[15px] hover:bg-white/[0.08] transition-colors"
          >
            {emoji}
          </button>
        ))}

        <div className="w-px h-4 bg-white/[0.08] mx-0.5" />

        <button
          type="button"
          onClick={onReply}
          className="flex h-7 w-7 items-center justify-center rounded text-zinc-400 hover:bg-white/[0.08] hover:text-zinc-200 transition-colors"
          title="Responder"
        >
          <Reply className="h-3.5 w-3.5" />
        </button>

        {onThread && (
          <button
            type="button"
            onClick={onThread}
            className="flex h-7 w-7 items-center justify-center rounded text-zinc-400 hover:bg-white/[0.08] hover:text-zinc-200 transition-colors"
            title="Abrir hilo"
          >
            <MessageSquare className="h-3.5 w-3.5" />
          </button>
        )}

        {moreSlot && (
          <>
            <div className="w-px h-4 bg-white/[0.08] mx-0.5" />
            {moreSlot}
          </>
        )}
      </div>
    );
  }

  // mode === "longpress" — floating menu over the message
  let topOffset = 0;
  if (messageRef?.current) {
    const rect = messageRef.current.getBoundingClientRect();
    const menuHeight = 120;
    topOffset = rect.top - menuHeight - 8;
    if (topOffset < 16) topOffset = rect.bottom + 8;
  }

  return (
    <>
      {/* Transparent overlay */}
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        onTouchStart={(e) => { e.stopPropagation(); e.preventDefault(); onClose(); }}
        style={{ WebkitUserSelect: "none", userSelect: "none" as const, WebkitTouchCallout: "none" as const, touchAction: "none" }}
      />

      {/* Floating menu */}
      <div
        ref={barRef}
        onTouchStart={(e) => e.stopPropagation()}
        className="fixed left-4 right-4 z-50 mx-auto max-w-xs rounded-xl animate-in fade-in zoom-in-95 duration-150"
        style={{
          top: topOffset > 0 ? topOffset : "50%",
          transform: topOffset > 0 ? undefined : "translateY(-50%)",
          backgroundColor: "#0d1220",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
          WebkitUserSelect: "none",
          userSelect: "none" as const,
          WebkitTouchCallout: "none" as const,
        }}
      >
        {/* Quick emojis row */}
        <div className="flex items-center justify-around px-3 py-2.5">
          {QUICK_EMOJIS_MOBILE.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => onReact(emoji)}
              className="flex h-10 w-10 items-center justify-center rounded-xl text-[22px] active:bg-white/[0.1] transition-colors"
            >
              {emoji}
            </button>
          ))}
        </div>

        {/* Separator */}
        <div className="h-px bg-white/[0.06] mx-3" />

        {/* Action buttons row */}
        <div className="flex items-center justify-around px-3 py-2">
          <button
            type="button"
            onClick={onReply}
            className="flex flex-col items-center gap-1 rounded-lg px-3 py-1.5 active:bg-white/[0.08] transition-colors"
          >
            <Reply className="h-4 w-4 text-zinc-400" />
            <span className="text-[10px] text-zinc-500">Responder</span>
          </button>

          {onThread && (
            <button
              type="button"
              onClick={onThread}
              className="flex flex-col items-center gap-1 rounded-lg px-3 py-1.5 active:bg-white/[0.08] transition-colors"
            >
              <MessageSquare className="h-4 w-4 text-zinc-400" />
              <span className="text-[10px] text-zinc-500">Hilo</span>
            </button>
          )}

          <button
            type="button"
            onClick={onCopy}
            className="flex flex-col items-center gap-1 rounded-lg px-3 py-1.5 active:bg-white/[0.08] transition-colors"
          >
            <Copy className="h-4 w-4 text-zinc-400" />
            <span className="text-[10px] text-zinc-500">Copiar</span>
          </button>
        </div>
      </div>
    </>
  );
}
