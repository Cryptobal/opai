"use client";

import { cn } from "@/lib/utils";
import {
  HORIZON_OPTIONS,
  type HorizonWeeks,
} from "./useHorizon";

/**
 * Selector segmented 8s · 16s · 24s · 32s. En móvil (<sm) colapsa a un
 * `<select>` nativo porque 4 botones de 44 px no caben junto a Hoy/flechas
 * en 375 px.
 */
export function HorizonSelector({
  value,
  onChange,
}: {
  value: HorizonWeeks;
  onChange: (h: HorizonWeeks) => void;
}) {
  return (
    <>
      <select
        aria-label="Horizonte de semanas"
        value={value}
        onChange={(e) => onChange(Number(e.target.value) as HorizonWeeks)}
        className="h-11 rounded-ds-md border border-ds-border-default bg-ds-surface-1 px-2 text-[13px] text-ds-text-1 sm:hidden"
      >
        {HORIZON_OPTIONS.map((h) => (
          <option key={h} value={h}>
            {h} semanas
          </option>
        ))}
      </select>
      <div
        role="group"
        aria-label="Horizonte de semanas"
        className="hidden items-center gap-0.5 rounded-ds-md border border-ds-border-default p-0.5 sm:inline-flex"
      >
        {HORIZON_OPTIONS.map((h) => {
          const active = h === value;
          return (
            <button
              key={h}
              type="button"
              onClick={() => onChange(h)}
              aria-pressed={active}
              className={cn(
                "inline-flex h-10 min-w-[44px] items-center justify-center rounded-ds-sm px-2 text-[12px] font-medium transition-colors",
                active
                  ? "bg-ds-surface-3 text-ds-text-1"
                  : "text-ds-text-3 hover:bg-ds-surface-2 hover:text-ds-text-2",
              )}
            >
              {h}s
            </button>
          );
        })}
      </div>
    </>
  );
}
