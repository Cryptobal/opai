"use client";

import { Coins } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  code: string;            // ej: "CES-241"
  size?: "sm" | "md";
  className?: string;
  /** Si viene, se usa como tooltip ("Cedido a {factoringName}"). */
  factoringName?: string | null;
}

/**
 * Badge violeta para indicar que el DTE está cedido a factoring.
 * Aparece inline en la celda de folio y como card en el slide-over.
 *
 * Cesión = categoría visual violeta (no hay variant violet en DS v3 Tag).
 * Usa los tokens `tint-violet` / `tint-violet-fg` del DS para mantener
 * coherencia con el resto de categóricos violetas (chat/deals, anexos
 * portal, etc.).
 */
export function CessionBadge({ code, size = "sm", className, factoringName }: Props) {
  const sizeCls = size === "md" ? "h-6 px-2.5 text-xs" : "h-5 px-2 text-xs";
  const title = factoringName ? `Cedido a ${factoringName}` : undefined;
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-medium leading-none whitespace-nowrap",
        "bg-tint-violet text-tint-violet-fg border-tint-violet-fg/30",
        sizeCls,
        className,
      )}
    >
      <Coins className="h-3 w-3" />
      {code}
    </span>
  );
}
