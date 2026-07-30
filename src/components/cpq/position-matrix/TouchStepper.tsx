"use client";

/**
 * Stepper táctil −/+ (móvil) para cantidades pequeñas como guardias y N° de
 * puestos. Botones de 40px: se opera con el pulgar sin abrir el selector nativo.
 */

import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export function TouchStepper({
  value,
  onChange,
  min = 1,
  max = 99,
  ariaLabel,
  className,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  ariaLabel: string;
  className?: string;
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  const step = (delta: number) => {
    const next = clamp(value + delta);
    if (next !== value) onChange(next);
  };

  return (
    <div
      className={cn(
        "flex h-10 items-center justify-between rounded-md border border-border bg-card",
        className,
      )}
      role="group"
      aria-label={ariaLabel}
    >
      <button
        type="button"
        onClick={() => step(-1)}
        disabled={value <= min}
        aria-label={`Disminuir ${ariaLabel}`}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-l-md text-foreground transition-colors enabled:active:bg-muted disabled:opacity-40"
      >
        <Minus className="h-4 w-4" />
      </button>
      <span className="min-w-[2ch] text-center font-mono text-base font-semibold tabular-nums text-foreground">
        {value}
      </span>
      <button
        type="button"
        onClick={() => step(1)}
        disabled={value >= max}
        aria-label={`Aumentar ${ariaLabel}`}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-r-md text-foreground transition-colors enabled:active:bg-muted disabled:opacity-40"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}
