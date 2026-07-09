"use client";

import { cn } from "@/lib/utils";
import type { ProjectionBucket } from "@/modules/finance/cashflow/types";
import { toDate } from "../format";
import { monthBands, isoWeek } from "./grid-helpers";

/**
 * Header de dos filas de la grilla:
 *  1. Bandas de mes: agrupan columnas contiguas del mismo mes (colspan) con
 *     tono alterno para leer el mes de un vistazo.
 *  2. Semanas: nº de semana ISO (eyebrow) + fecha del lunes. La semana actual
 *     va acentuada.
 * La esquina izquierda (columna cliente) queda sticky sobre ambas filas.
 */
export function GridHeader({
  buckets,
  currentIdx,
}: {
  buckets: ProjectionBucket[];
  currentIdx: number;
}) {
  const bands = monthBands(buckets);
  return (
    <thead>
      {/* Fila 1 — bandas de mes */}
      <tr className="border-b border-ds-border-default">
        <th
          rowSpan={2}
          className="sticky left-0 z-30 min-w-[160px] max-w-[220px] border-r border-ds-border-default bg-ds-surface-2 p-2 text-left align-bottom text-[12px] font-medium text-ds-text-2"
        >
          Cliente / contrato
        </th>
        {bands.map((band) => (
          <th
            key={band.key}
            colSpan={band.span}
            className={cn(
              "border-l border-ds-border-default p-1 text-center text-[11px] font-mono uppercase tracking-[0.08em] text-ds-text-3",
              band.even ? "bg-ds-surface-2" : "bg-ds-surface-1",
            )}
          >
            {band.label}
          </th>
        ))}
      </tr>
      {/* Fila 2 — semanas */}
      <tr className="border-b border-ds-border-default bg-ds-surface-1">
        {buckets.map((b, i) => {
          const monday = toDate(b.start);
          const isCurrent = i === currentIdx;
          const dayLabel = monday
            .toLocaleDateString("es-CL", {
              day: "numeric",
              month: "short",
              timeZone: "UTC",
            })
            .replace(".", "");
          return (
            <th
              key={b.key}
              className={cn(
                "min-w-[86px] border-l border-ds-border-default px-1.5 py-1.5 text-center",
                isCurrent && "bg-primary/10",
              )}
            >
              <div
                className={cn(
                  "text-[11px] font-mono uppercase tracking-[0.08em]",
                  isCurrent ? "text-primary" : "text-ds-text-4",
                )}
              >
                S{isoWeek(monday)}
              </div>
              <div
                className={cn(
                  "text-[12px] font-medium",
                  isCurrent ? "text-primary" : "text-ds-text-2",
                )}
              >
                {dayLabel}
              </div>
            </th>
          );
        })}
      </tr>
    </thead>
  );
}
