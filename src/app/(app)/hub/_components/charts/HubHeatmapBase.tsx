"use client";

/**
 * HubHeatmapBase — heatmap genérico responsive.
 *
 * - Mobile (default): celdas 14px, labels ~110px.
 * - Desktop (md+): celdas configurables (default 28px), labels ~180px.
 * - Cada fila puede ser clickeable (href).
 * - Tooltip opcional con info de fórmula.
 *
 * El sizing usa CSS vars scoped a `.hub-hm-root` vía styled-jsx (clase
 * normal, NO `:root` ni `:global`). Cualquier media query activa el bloque
 * desktop y ambas vars se propagan por cascade a celdas/headers/labels.
 */

import { useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface HeatmapColumn {
  label: string;
  sublabel?: string;
}

export interface HeatmapRow {
  id: string;
  label: string;
  values: number[];
  summary?: { value: string | number; color?: string; label?: string };
  href?: string;
}

export interface HubHeatmapBaseProps {
  title: string;
  subtitle?: string;
  rows: HeatmapRow[];
  columns: HeatmapColumn[];
  colorFn?: (value: number, max: number) => string;
  legendLeft?: string;
  legendRight?: string;
  detailHref?: string;
  detailLabel?: string;
  formulaTooltip?: string;
  /** Tamaño de celda en desktop (default 28). Mobile siempre 14. */
  desktopCellSize?: number;
  /** Ancho columna de etiquetas. Default mobile 110, desktop 180. */
  labelColWidth?: { mobile: number; desktop: number };
  emptyState?: React.ReactNode;
  loading?: boolean;
}

const MOBILE_CELL_PX = 14;

const DEFAULT_COLOR_SCALE = (value: number, max: number): string => {
  if (value <= 0) return 'rgba(255,255,255,0.04)';
  const intensity = max > 0 ? Math.min(value / max, 1) : 0;
  const alpha = 0.15 + intensity * 0.85;
  return `rgba(45,212,160,${alpha})`;
};

export function HubHeatmapBase({
  title,
  subtitle,
  rows,
  columns,
  colorFn = DEFAULT_COLOR_SCALE,
  legendLeft = 'Menos',
  legendRight = 'Más',
  detailHref,
  detailLabel = 'Ver detalle',
  formulaTooltip,
  desktopCellSize = 28,
  labelColWidth = { mobile: 110, desktop: 180 },
  emptyState,
  loading = false,
}: HubHeatmapBaseProps) {
  const [showFormula, setShowFormula] = useState(false);
  const max = rows.reduce((m, r) => Math.max(m, ...r.values), 0);

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground">Cargando…</p>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        {emptyState ?? (
          <p className="text-xs text-muted-foreground">Sin datos para mostrar.</p>
        )}
      </div>
    );
  }

  // CSS var con fallback: si por alguna razón --hm-cell no está, usa mobile.
  const cellVar = `var(--hm-cell, ${MOBILE_CELL_PX}px)`;
  const labelVar = `var(--hm-label, ${labelColWidth.mobile}px)`;

  return (
    <div className="rounded-lg border border-border bg-card p-3 md:p-4 hub-hm-root">
      {/* Header */}
      <div className="flex items-center justify-between mb-2 md:mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-xs md:text-sm font-semibold capitalize truncate">{title}</p>
            {formulaTooltip && (
              <button
                type="button"
                onClick={() => setShowFormula((s) => !s)}
                className="text-primary/70 hover:text-primary transition-colors"
                aria-label="Cómo se calcula"
              >
                <Info className="h-4 w-4" />
              </button>
            )}
          </div>
          {subtitle && (
            <p className="text-[10px] md:text-xs text-muted-foreground mt-0.5">{subtitle}</p>
          )}
        </div>
        {detailHref && (
          <Link
            href={detailHref}
            className="flex items-center gap-0.5 text-[10px] md:text-xs font-medium text-primary hover:underline whitespace-nowrap"
          >
            {detailLabel}
            <ChevronRight className="h-3 w-3" />
          </Link>
        )}
      </div>

      {/* Formula tooltip (toggle) */}
      {showFormula && formulaTooltip && (
        <div className="mb-3 rounded-md border border-primary/30 bg-primary/5 p-2 text-[10px] md:text-xs text-muted-foreground">
          <span className="font-semibold text-primary">¿Cómo se calcula?</span>
          <p className="mt-1 whitespace-pre-line">{formulaTooltip}</p>
        </div>
      )}

      {/* Grid */}
      <div className="overflow-x-auto -mx-1 px-1">
        <div className="inline-block min-w-full">
          {/* Column headers */}
          <div
            className="grid gap-px mb-1"
            style={{
              marginLeft: labelVar,
              gridTemplateColumns: `repeat(${columns.length}, ${cellVar}) 1fr`,
            }}
          >
            {columns.map((col, i) => (
              <div
                key={`col-${i}`}
                className="text-[8px] md:text-[10px] text-center text-muted-foreground tabular-nums leading-tight"
              >
                <div>{col.label}</div>
                {col.sublabel && <div className="text-[7px] md:text-[9px] opacity-70">{col.sublabel}</div>}
              </div>
            ))}
            <div />
          </div>

          {/* Rows */}
          {rows.map((row) => {
            const RowWrapper = row.href ? Link : 'div';
            const wrapperProps = row.href ? { href: row.href } : {};
            return (
              <RowWrapper
                key={row.id}
                {...(wrapperProps as { href: string })}
                className={cn(
                  'flex items-center gap-px mb-px rounded-sm transition-colors',
                  row.href && 'hover:bg-accent/30 cursor-pointer'
                )}
              >
                <div
                  className="pr-2 text-[10px] md:text-xs text-muted-foreground truncate"
                  style={{ width: labelVar }}
                >
                  {row.label}
                </div>
                <div
                  className="grid gap-px"
                  style={{ gridTemplateColumns: `repeat(${columns.length}, ${cellVar})` }}
                >
                  {columns.map((col, idx) => {
                    const value = row.values[idx] ?? 0;
                    return (
                      <div
                        key={`cell-${row.id}-${idx}`}
                        className="rounded-sm"
                        style={{
                          backgroundColor: colorFn(value, max),
                          height: cellVar,
                          width: cellVar,
                        }}
                        title={`${row.label} — ${col.label}: ${value}`}
                      />
                    );
                  })}
                </div>
                {row.summary && (
                  <div
                    className="ml-2 text-[10px] md:text-xs font-bold tabular-nums whitespace-nowrap"
                    style={{ color: row.summary.color }}
                  >
                    {row.summary.value}
                    {row.summary.label && (
                      <span className="ml-1 font-normal text-muted-foreground">{row.summary.label}</span>
                    )}
                  </div>
                )}
              </RowWrapper>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-end gap-1.5 mt-3">
        <span className="text-[9px] md:text-[10px] text-muted-foreground">{legendLeft}</span>
        {[0, 0.25, 0.5, 0.75, 1].map((v, i) => (
          <div
            key={`legend-${i}`}
            className="h-2.5 w-2.5 md:h-3 md:w-3 rounded-sm"
            style={{ backgroundColor: colorFn(v * max, max) }}
          />
        ))}
        <span className="text-[9px] md:text-[10px] text-muted-foreground">{legendRight}</span>
      </div>

      {/* CSS vars scoped a .hub-hm-root vía styled-jsx (clase normal,
          NO :root global). Cascade hacia celdas/headers/labels. */}
      <style jsx>{`
        .hub-hm-root {
          --hm-cell: ${MOBILE_CELL_PX}px;
          --hm-label: ${labelColWidth.mobile}px;
        }
        @media (min-width: 768px) {
          .hub-hm-root {
            --hm-cell: ${desktopCellSize}px;
            --hm-label: ${labelColWidth.desktop}px;
          }
        }
      `}</style>
    </div>
  );
}
