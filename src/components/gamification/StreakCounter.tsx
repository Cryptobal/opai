"use client";

import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Size presets ─── */

const SIZE_MAP = {
  sm: { icon: 14, text: "text-xs" },
  md: { icon: 18, text: "text-sm" },
  lg: { icon: 22, text: "text-base" },
} as const;

/* ─── Props ─── */

interface StreakCounterProps {
  days: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}

/* ─── Component ─── */

export function StreakCounter({
  days,
  size = "md",
  className,
}: StreakCounterProps) {
  if (days <= 0) return null;

  const { icon, text } = SIZE_MAP[size];

  return (
    <div className={cn("inline-flex items-center gap-1", className)}>
      <Flame size={icon} className="text-orange-500" />
      <span className={cn("font-medium text-foreground", text)}>
        {days} {days === 1 ? "dia" : "dias"}
      </span>
    </div>
  );
}
