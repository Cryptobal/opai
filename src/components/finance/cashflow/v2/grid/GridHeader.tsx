"use client";

import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProjectionBucket } from "@/modules/finance/cashflow/types";
import { toDate } from "../format";
import { monthBands, isoWeek, type BucketMeta } from "./grid-helpers";

/**
 * Header de dos filas de la grilla:
 *  1. Bandas de mes: agrupan columnas contiguas del mismo mes (colspan) con
 *     tono alterno para leer el mes de un vistazo.
 *  2. Semanas: nº de semana ISO (eyebrow) + fecha del lunes. La semana actual
 *     va acentuada; las cerradas selladas (candado, atenuadas); la anclada
 *     dibuja la línea de ancla. En la semana actual abierta aparece "Cerrar".
 */
export function GridHeader({
  buckets,
  currentIdx,
  bucketMeta,
  canManage,
  onCloseWeek,
}: {
  buckets: ProjectionBucket[];
  currentIdx: number;
  bucketMeta?: Map<string, BucketMeta>;
  canManage: boolean;
  onCloseWeek: (weekEndIso: string) => void;
}) {
  const bands = monthBands(buckets);
  return (
    // Header sticky-top: ambas filas (bandas de mes + semanas) quedan fijas
    // arriba al hacer scroll vertical dentro del contenedor scrollable. El
    // `<thead>` sticky crea un contexto de apilado (z-20) por encima del cuerpo
    // (celdas sticky-left z-10 / balance z-20); la esquina Cliente/contrato es
    // sticky en los dos ejes (top vía thead + left propio) y lleva el z más alto
    // (z-30) para no ser tapada por nada. Fondo sólido en cada celda para que las
    // filas del cuerpo no se transparenten por detrás.
    <thead className="sticky top-0 z-20 bg-ds-surface-1">
      {/* Fila 1 — bandas de mes */}
      <tr className="border-b border-ds-border-default">
        <th
          rowSpan={2}
          className="sticky left-0 z-30 min-w-[160px] max-w-[220px] max-md:min-w-[100px] max-md:max-w-[128px] border-r border-ds-border-default bg-ds-surface-2 p-2 text-left align-bottom text-[12px] font-medium text-ds-text-2"
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
          const meta = bucketMeta?.get(b.key);
          const closed = meta?.closed ?? false;
          const showClose = canManage && isCurrent && !closed;
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
                "min-w-[86px] border-l border-ds-border-default px-1.5 py-1.5 text-center align-top",
                isCurrent && "bg-primary/10",
                closed && "bg-ds-surface-2/50 opacity-70",
                meta?.anchor && "border-r-2 border-r-primary",
              )}
            >
              <div
                className={cn(
                  "flex items-center justify-center gap-1 text-[11px] font-mono uppercase tracking-[0.08em]",
                  isCurrent ? "text-primary" : "text-ds-text-4",
                )}
              >
                {closed && <Lock className="h-2.5 w-2.5" aria-hidden />}
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
              {showClose && (
                <button
                  type="button"
                  onClick={() => onCloseWeek(toDate(b.end).toISOString())}
                  className="mt-1 inline-flex h-7 items-center gap-1 rounded-ds-sm border border-primary/40 px-1.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/10"
                >
                  <Lock className="h-3 w-3" aria-hidden /> Cerrar
                </button>
              )}
            </th>
          );
        })}
      </tr>
    </thead>
  );
}
