"use client";

import { useMemo } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  ProjectionAnchorInfo,
  ProjectionBucket,
  ProjectionRow,
} from "@/modules/finance/cashflow/types";
import { deriveCumulative } from "./derive-balance";
import { isoWeek } from "./grid-helpers";
import { toDate } from "../format";
import { useChartOpen } from "./useChartOpen";

/**
 * Mini-gráfico SVG: barras ingresos (↑ ok) / egresos (↓ danger) + línea de
 * saldo (`deriveCumulative`). Sincronizado con la ventana; click → goToWeek.
 */
export function FlowMiniChart({
  buckets,
  rows,
  openingBalanceClp,
  anchor,
  currentIdx,
  onSelectWeek,
  isMobile,
}: {
  buckets: ProjectionBucket[];
  rows: ProjectionRow[];
  openingBalanceClp: number;
  anchor: ProjectionAnchorInfo | null;
  currentIdx: number;
  onSelectWeek: (weekStart: Date) => void;
  isMobile: boolean;
}) {
  const { open, toggle } = useChartOpen(isMobile);
  const n = Math.max(buckets.length, 1);
  const W = Math.max(n * 28, 200);
  const H = isMobile ? 88 : 120;
  const mid = H * 0.52;
  const barMaxH = mid - 8;

  const points = useMemo(
    () => deriveCumulative(buckets, rows, openingBalanceClp, anchor),
    [buckets, rows, openingBalanceClp, anchor],
  );
  const maxFlow = Math.max(
    1,
    ...buckets.map((b) => Math.max(b.income, b.expense)),
  );
  const bals = points.map((p) => p.balanceClp);
  const maxAbsBal = Math.max(1, ...bals.map(Math.abs), Math.abs(Math.min(0, ...bals)));
  const balY = (v: number) =>
    H - 6 - ((v + maxAbsBal) / (2 * maxAbsBal)) * (H - 12);
  const colW = W / n;
  const minBal = Math.min(0, ...bals);
  const maxBal = Math.max(0, ...bals);
  const aria = `Flujo semanal, ${n} semanas, saldo ${Math.round(minBal).toLocaleString("es-CL")} a ${Math.round(maxBal).toLocaleString("es-CL")}`;

  return (
    <div className="rounded-ds-lg border border-ds-border-default bg-ds-surface-1">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex h-10 w-full items-center justify-between gap-2 px-3 text-left text-[13px] font-medium text-ds-text-2 hover:bg-ds-surface-2 sm:h-9"
      >
        <span>Flujo semanal</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-ds-text-3 motion-safe:transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <div className="px-2 pb-2">
          <svg
            role="img"
            aria-label={aria}
            viewBox={`0 0 ${W} ${H}`}
            className="h-[88px] w-full sm:h-[120px]"
            preserveAspectRatio="none"
          >
            <line x1={0} y1={mid} x2={W} y2={mid} stroke="hsl(var(--ds-border-default))" strokeWidth={1} />
            {currentIdx >= 0 && (
              <line
                x1={colW * (currentIdx + 0.5)}
                y1={0}
                x2={colW * (currentIdx + 0.5)}
                y2={H}
                stroke="hsl(var(--ds-info))"
                strokeWidth={1}
                strokeDasharray="3 3"
                opacity={0.5}
              />
            )}
            {buckets.map((b, i) => {
              const x = colW * i + colW * 0.2;
              const bw = colW * 0.6;
              const ih = (b.income / maxFlow) * barMaxH;
              const eh = (b.expense / maxFlow) * barMaxH;
              const bal = points[i]?.balanceClp ?? 0;
              const iso = isoWeek(toDate(b.start));
              const title = `S${iso} · +${Math.round(b.income).toLocaleString("es-CL")} · −${Math.round(b.expense).toLocaleString("es-CL")} · saldo ${Math.round(bal).toLocaleString("es-CL")}`;
              return (
                <g
                  key={b.key}
                  tabIndex={0}
                  role="button"
                  aria-label={title}
                  className="cursor-pointer outline-none focus:opacity-80"
                  onClick={() => onSelectWeek(toDate(b.start))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelectWeek(toDate(b.start));
                    }
                  }}
                >
                  <title>{title}</title>
                  <rect x={x} y={mid - ih} width={bw} height={Math.max(ih, 0)} fill="hsl(var(--ds-ok) / 0.45)" />
                  <rect x={x} y={mid} width={bw} height={Math.max(eh, 0)} fill="hsl(var(--ds-danger) / 0.45)" />
                </g>
              );
            })}
            {points.slice(0, -1).map((p, i) => {
              const a = p.balanceClp;
              const b = points[i + 1].balanceClp;
              const neg = a < 0 || b < 0;
              return (
                <line
                  key={`seg-${p.bucketKey}`}
                  x1={colW * (i + 0.5)}
                  y1={balY(a)}
                  x2={colW * (i + 1.5)}
                  y2={balY(b)}
                  stroke={neg ? "hsl(var(--ds-danger))" : "hsl(var(--ds-info))"}
                  strokeWidth={1.5}
                />
              );
            })}
            {points.map((p, i) => (
              <circle
                key={p.bucketKey}
                cx={colW * (i + 0.5)}
                cy={balY(p.balanceClp)}
                r={2}
                fill={
                  p.balanceClp < 0
                    ? "hsl(var(--ds-danger))"
                    : "hsl(var(--ds-info))"
                }
              />
            ))}
          </svg>
        </div>
      )}
    </div>
  );
}
