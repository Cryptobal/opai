"use client";

/**
 * OPAI DS v3 — HeatGrid
 *
 * Matriz de calor genérica filas × columnas. Cada celda muestra un score
 * 0-100 mapeado a un threshold (ok/warn/danger) o "neutral" si es null.
 *
 * Reemplaza al patrón HeatmapMatrix + HeatmapCell de Conocimiento, pero
 * generalizado para cualquier módulo (turnos × instalaciones, KPIs ×
 * período, etc.).
 *
 * Características:
 *  - Headers de fila truncables (ancho configurable).
 *  - Headers de columna con tooltip via title attr.
 *  - Scroll horizontal en mobile cuando se desborda.
 *  - Leyenda integrada opcional.
 *  - Tipografía mono pequeña para etiquetas (eyebrow legítimo).
 */

import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { thresholdFromScore, type Threshold } from "./tokens";

export interface HeatGridRow {
  id: string;
  label: ReactNode;
}

export interface HeatGridColumn {
  id: string;
  /** Etiqueta corta visible (ej. abreviación). */
  shortLabel: string;
  /** Etiqueta larga (tooltip). */
  fullLabel?: string;
}

export interface HeatGridProps {
  rows: HeatGridRow[];
  columns: HeatGridColumn[];
  /** Devuelve el score 0-100 para una celda dada, o null si no aplica. */
  getScore: (rowId: string, columnId: string) => number | null;
  /** Header de la primera columna (para las etiquetas de fila). */
  rowHeaderLabel?: string;
  /** Mostrar leyenda debajo. */
  showLegend?: boolean;
  /** Empty state cuando no hay datos. */
  emptyMessage?: string;
  className?: string;
}

const CELL_BG: Record<Threshold, string> = {
  ok:      "bg-status-ok/80",
  warn:    "bg-status-warn/80",
  danger:  "bg-status-danger/80",
  neutral: "bg-ds-surface-3",
};

export function HeatGrid({
  rows,
  columns,
  getScore,
  rowHeaderLabel = "",
  showLegend = true,
  emptyMessage = "Aún no hay datos suficientes.",
  className,
}: HeatGridProps) {
  if (!rows.length || !columns.length) {
    return (
      <p className={cn("text-[12px] text-ds-text-3 px-3 py-4 text-center", className)}>
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className={cn("space-y-2.5", className)}>
      <div className="overflow-x-auto ds-scroll-x">
        <table className="text-[11px] font-mono">
          <thead>
            <tr>
              <th className="text-left w-32 pb-1.5 pr-2 text-ds-text-4 font-normal uppercase tracking-[0.06em]">
                {rowHeaderLabel}
              </th>
              {columns.map((c) => (
                <th
                  key={c.id}
                  className="px-1 pb-1.5 text-ds-text-4 font-normal text-center min-w-7 uppercase tracking-[0.06em]"
                  title={c.fullLabel ?? c.shortLabel}
                >
                  {c.shortLabel}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="pr-2 py-1 text-ds-text-2 truncate max-w-32">
                  {r.label}
                </td>
                {columns.map((c) => {
                  const score = getScore(r.id, c.id);
                  const t: Threshold = score == null ? "neutral" : thresholdFromScore(score);
                  return (
                    <td key={c.id} className="px-1 py-1">
                      <div
                        className={cn(
                          "aspect-square rounded-[6px] w-6",
                          CELL_BG[t],
                        )}
                        aria-label={
                          score != null
                            ? `${r.id} — ${c.shortLabel}: ${score}%`
                            : `${r.id} — ${c.shortLabel}: sin evaluar`
                        }
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showLegend && (
        <div className="flex items-center gap-3 text-[11px] font-mono uppercase tracking-[0.06em] text-ds-text-4 flex-wrap">
          <span className="flex items-center gap-1.5">
            <span className="aspect-square w-3 rounded-[4px] bg-status-ok/80 inline-block" />
            ≥ 80%
          </span>
          <span className="flex items-center gap-1.5">
            <span className="aspect-square w-3 rounded-[4px] bg-status-warn/80 inline-block" />
            60–79%
          </span>
          <span className="flex items-center gap-1.5">
            <span className="aspect-square w-3 rounded-[4px] bg-status-danger/80 inline-block" />
            &lt; 60%
          </span>
          <span className="flex items-center gap-1.5">
            <span className="aspect-square w-3 rounded-[4px] bg-ds-surface-3 inline-block" />
            sin eval.
          </span>
        </div>
      )}
    </div>
  );
}
