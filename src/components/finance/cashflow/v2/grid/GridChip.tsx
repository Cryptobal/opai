"use client";

import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmt } from "@/components/finance/cashflow/MatrixHelpers";
import type { PillVariant } from "@/components/finance/cashflow/CellStatusPill";

/**
 * Borde izquierdo de estado (3px) — tokens DS / status / tint.
 * Sin fondos saturados: surface-2 + border-subtle.
 */
const EDGE: Record<PillVariant, string> = {
  PROJECTED: "border-l-ds-border-strong",
  DRAFT: "border-l-status-warn",
  INVOICED: "border-l-status-info",
  FACTORING: "border-l-tint-violet",
  FACTORING_COLLECTED: "border-l-tint-teal",
  PAID: "border-l-status-ok",
  OVERDUE: "border-l-status-danger",
  VOIDED: "border-l-status-danger opacity-70",
};

/**
 * Chip minimalista de cuota: surface + borde sutil + borde izquierdo de estado.
 * Micro-feedback de aterrizaje al montar (respeta prefers-reduced-motion).
 */
export function GridChip({
  amount,
  variant,
  locked = false,
  draggable = false,
  elevated = false,
  title,
  caption,
  landing = false,
}: {
  amount: number;
  variant: PillVariant;
  locked?: boolean;
  draggable?: boolean;
  elevated?: boolean;
  title?: string;
  caption?: string | null;
  /** Flash de aterrizaje (create/move). */
  landing?: boolean;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex min-h-[30px] flex-col justify-center gap-0.5 rounded-ds-sm border border-ds-border-subtle border-l-[3px] bg-ds-surface-2 px-1.5 py-1 font-mono text-[12px] font-medium tabular-nums text-ds-text-1",
        EDGE[variant],
        variant === "VOIDED" && "line-through",
        draggable && "cursor-grab active:cursor-grabbing",
        elevated && "scale-105 shadow-lg ring-2 ring-inset ring-primary/50",
        landing && "cf-chip-land",
      )}
    >
      <span className="inline-flex items-center justify-center gap-1 leading-none">
        {locked && <Lock className="h-3 w-3 shrink-0 opacity-70" aria-hidden />}
        {fmt.format(amount)}
      </span>
      {caption && (
        <span className="-mb-0.5 self-end text-[12px] font-normal leading-none text-ds-text-4">
          {caption}
        </span>
      )}
    </span>
  );
}
