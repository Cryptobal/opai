"use client";

import { Coins } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  code: string;            // ej: "CES-241"
  size?: "sm" | "md";
  className?: string;
}

/**
 * Badge violeta para indicar que el DTE está cedido a factoring.
 * Aparece inline en la celda de folio y como card en el slide-over.
 *
 * Usa color violet custom (no hay variant violet en DS v3 Tag).
 */
export function CessionBadge({ code, size = "sm", className }: Props) {
  const sizeCls =
    size === "md" ? "h-6 px-2.5 text-[12px]" : "h-5 px-2 text-[11px]";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-medium leading-none whitespace-nowrap",
        "bg-violet-500/12 text-violet-300 border-violet-500/30",
        sizeCls,
        className,
      )}
    >
      <Coins className="h-3 w-3" />
      {code}
    </span>
  );
}
