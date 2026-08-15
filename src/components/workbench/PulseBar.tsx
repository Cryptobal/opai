"use client";

/**
 * PulseBar — firma visual del workbench comercial (lead | quote | tender).
 * Presentacional puro: sin fetch ni estado de negocio.
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type PulseVariant = "lead" | "quote" | "tender";

export function PulseBar({
  variant,
  statusSlot,
  value,
  subtitle,
  progress,
  actionsSlot,
  /** Fuerza tono neutro (ej. tender sin fecha de entrega definida). */
  neutral,
  className,
}: {
  variant: PulseVariant;
  /** Pill de estado (izq.). */
  statusSlot?: ReactNode;
  /** Valor principal: "8 guardias", "$4.850.000", "6 días". */
  value: ReactNode;
  subtitle?: ReactNode;
  /** 0–1 para anillo de countdown (tender) o gate. */
  progress?: number | null;
  actionsSlot?: ReactNode;
  neutral?: boolean;
  className?: string;
}) {
  const tone = neutral
    ? "text-ds-text-3"
    : variant === "tender"
      ? "text-status-warn-fg [text-shadow:0_0_22px_rgba(245,165,36,0.30)]"
      : "text-[var(--ds-glow)] [text-shadow:0_0_22px_rgba(var(--ds-glow-rgb),0.35)]";

  const showRing =
    variant === "tender" &&
    typeof progress === "number" &&
    Number.isFinite(progress);
  const circ = 2 * Math.PI * 10.5;
  const offset = showRing
    ? circ * (1 - Math.min(1, Math.max(0, progress as number)))
    : 0;

  return (
    <div
      className={cn(
        "flex min-h-[54px] items-center gap-2.5 px-3 py-2 sm:px-3",
        className,
      )}
      data-pulse={variant}
    >
      {statusSlot ? <div className="shrink-0">{statusSlot}</div> : null}
      <div className="flex min-w-0 flex-1 flex-col items-end leading-tight">
        <span
          className={cn(
            "flex min-w-0 items-center gap-2 font-mono text-[19px] font-extrabold tabular-nums tracking-tight",
            tone,
          )}
        >
          {variant === "lead" ? <span className="wb-ping" aria-hidden /> : null}
          {showRing ? (
            <svg className="wb-cring" viewBox="0 0 26 26" aria-hidden>
              <circle className="wb-cring-track" cx="13" cy="13" r="10.5" />
              <circle
                className="wb-cring-prog"
                cx="13"
                cy="13"
                r="10.5"
                strokeDasharray={circ}
                strokeDashoffset={offset}
              />
            </svg>
          ) : null}
          <span className="truncate">{value}</span>
        </span>
        {subtitle ? (
          <span className="mt-0.5 max-w-full truncate text-[12px] text-ds-text-3">
            {subtitle}
          </span>
        ) : null}
      </div>
      {actionsSlot ? <div className="shrink-0">{actionsSlot}</div> : null}
    </div>
  );
}
