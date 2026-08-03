"use client";

import { fmtCell, type NumberFormatMode } from "./format";
import type { DiscreteSelStats } from "./range-sel";

interface Props {
  stats: DiscreteSelStats;
  numberFormat?: NumberFormatMode;
  onDone: () => void;
}

/** Píldora flotante inferior: Suma / Prom / N del modo Σ (solo móvil). */
export function SumPill({ stats, numberFormat = "clp", onDone }: Props) {
  if (stats.count === 0) return null;
  const fmt = (n: number) => fmtCell(n, numberFormat);
  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-40 flex justify-center px-3 lg:hidden"
      style={{ bottom: "max(4.5rem, calc(env(safe-area-inset-bottom) + 3.5rem))" }}
    >
      <div className="pointer-events-auto flex max-w-full items-center gap-3 rounded-full border border-ds-border-default bg-ds-surface-3/95 px-4 py-2 shadow-lg backdrop-blur-md opai-glass-strong">
        <div className="min-w-0 truncate text-[13px] tabular-nums text-ds-text-1">
          Suma <span className="font-medium">{fmt(stats.sum)}</span>
          {stats.avg != null && (
            <>
              {" · "}Prom <span className="font-medium">{fmt(stats.avg)}</span>
            </>
          )}
          <span className="text-ds-text-4"> · N={stats.count}</span>
        </div>
        <button
          type="button"
          onClick={onDone}
          className="shrink-0 rounded-full bg-primary px-3 py-1.5 text-[13px] font-medium text-primary-foreground min-h-10"
        >
          Listo
        </button>
      </div>
    </div>
  );
}
