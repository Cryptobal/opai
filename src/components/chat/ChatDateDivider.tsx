"use client";

import { cn } from "@/lib/utils";

interface ChatDateDividerProps {
  label: string;
  className?: string;
}

/**
 * Pill-style date separator with horizontal lines.
 * Label examples: "Hoy", "Ayer", "Martes, 3 de marzo"
 */
export function ChatDateDivider({ label, className }: ChatDateDividerProps) {
  return (
    <div className={cn("flex items-center gap-3 my-4", className)}>
      <div className="flex-1 h-px bg-[rgba(255,255,255,0.06)]" />
      <span className="shrink-0 text-xs font-semibold text-[rgba(255,255,255,0.45)] border border-[rgba(255,255,255,0.06)] rounded-[20px] px-3 py-1">
        {label}
      </span>
      <div className="flex-1 h-px bg-[rgba(255,255,255,0.06)]" />
    </div>
  );
}
