"use client";

import { cn } from "@/lib/utils";
import { NIVEL_CONFIG } from "./types";

/* ─── Props ─── */

interface NivelBadgeProps {
  nivel: string;
  className?: string;
}

/* ─── Component ─── */

export function NivelBadge({ nivel, className }: NivelBadgeProps) {
  const config = NIVEL_CONFIG[nivel.toLowerCase()];

  if (!config) {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-full border border-border px-2.5 py-0.5 text-xs font-semibold text-muted-foreground",
          className
        )}
      >
        {nivel}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        config.color,
        `${config.bgColor}/15`,
        `border-current/25`,
        className
      )}
    >
      {config.label}
    </span>
  );
}
