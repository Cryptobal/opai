"use client";

import { ChevronDown, Plus, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function ChatHeader({
  threadTitle,
  onOpenThreads,
  onNew,
  onClose,
  swipeHandlers,
}: {
  threadTitle: string;
  onOpenThreads: () => void;
  onNew: () => void;
  onClose: () => void;
  swipeHandlers?: {
    onTouchStart: (e: React.TouchEvent) => void;
    onTouchMove: (e: React.TouchEvent) => void;
    onTouchEnd: (e: React.TouchEvent) => void;
  };
}) {
  return (
    <div className="shrink-0 border-b border-ds-border-subtle">
      {/* Tirador — aporta aire bajo la curva del sheet */}
      <div
        className="mx-auto mt-[7px] h-1 w-[34px] shrink-0 rounded-full bg-white/20"
        aria-hidden
      />
      <div className="flex h-[58px] items-center gap-2 px-3 pt-2">
        {/* Gestos de swipe: solo la zona no interactiva */}
        <div
          className="flex min-w-0 flex-1 touch-none items-center gap-2"
          {...(swipeHandlers ?? {})}
        >
          <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70 shadow-[0_0_14px_hsl(var(--primary)/0.45)]">
            <Sparkles className="h-3.5 w-3.5 text-primary-foreground" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-ds-body font-semibold leading-none text-ds-text-1">
              Intelligence
            </p>
            {/* El selector de hilo recupera toques con touch-auto */}
            <button
              type="button"
              onClick={onOpenThreads}
              className="mt-0.5 flex max-w-full touch-auto items-center gap-0.5 text-[12px] text-ds-text-3"
            >
              <span className="truncate">{threadTitle}</span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0" />
            </button>
          </div>
        </div>
        <button
          type="button"
          aria-label="Nueva conversación"
          onClick={onNew}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ds-text-2 hover:bg-ds-surface-2"
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Cerrar asistente IA"
          onClick={onClose}
          className={cn(
            "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
            "text-ds-text-2 hover:bg-ds-surface-2 active:bg-ds-surface-3",
          )}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
