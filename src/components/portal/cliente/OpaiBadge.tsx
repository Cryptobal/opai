"use client";

import { cn } from "@/lib/utils";

interface OpaiBadgeProps {
  text?: string;
  variant?: "default" | "ai" | "live" | "exclusive";
  className?: string;
}

const VARIANT_CONFIG = {
  default: { text: "Tecnología OPAI" },
  ai: { text: "OPAI AI-powered" },
  live: { text: "En vivo · OPAI" },
  exclusive: { text: "Exclusivo OPAI" },
} as const;

export function OpaiBadge({
  text,
  variant = "default",
  className,
}: OpaiBadgeProps) {
  const displayText = text ?? VARIANT_CONFIG[variant].text;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-medium rounded-full px-2 py-0.5",
        "bg-status-info-soft text-teal-400/80 border border-teal-500/15",
        className,
      )}
    >
      {variant === "live" && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
        </span>
      )}
      {displayText}
    </span>
  );
}
