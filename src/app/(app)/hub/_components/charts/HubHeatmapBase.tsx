"use client";

/**
 * HubHeatmapBase — heatmap genérico responsive.
 *
 * - Mobile (default): celdas 14px, fuente 8-10px.
 * - Desktop (md+): celdas 28px, fuente 11-12px (ajustable con `desktopCellSize`).
 * - Cada fila es clickeable (onClick / href).
 * - Tooltip con info de fórmula vía `formulaTooltip`.
 */

import { useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface HeatmapColumn {
  /** Etiqueta de la columna (ej. "1", "2", "Lun", "P1") */
  label: string;
  /** Sub-etiqueta opcional (ej. mes, día de semana) */
  sublabel?: string;
}

export interface HeatmapRow {
  id: string;
  label: string;
  /** Valores por columna (mismo orden que `columns`) */
  values: number[];
  /** Métrica de resumen para mostrar a la derecha (ej. promedio, total) */
  summary?: { value: string | number; color?: string; label?: string };
  /** Link al hacer click en la fila (toda la fila navega) */
  href?: string;
}

export interface HubHeatmapBaseProps {
  title: string;
  subtitle?: string;
  rows: HeatmapRow[];
  columns: HeatmapColumn[];
  /** Función que mapea valor → color (rgba/hex). Default: emerald scale. */
  colorFn?: (value: number, max: number) => string;
  /** Etiqueta de leyenda izquierda (ej. "Menos") */
  legendLeft?: string;
  /** Etiqueta de leyenda derecha (ej. "Más") */
  legendRight?: string;
  /** Link al dashboard completo. */
  detailHref?: string;
  detailLabel?: string;
  /** Tooltip con la fórmula de cálculo */
  formulaTooltip?: string;
  /** Tamaño de celda en desktop (default 28). En mobile siempre 14. */
  desktopCellSize?: number;
  /** Ancho de columna de etiquetas (default mobile 110, desktop 180) */
  labelColWidth?: { mobile: number; desktop: number };
  /** Estado vacío personalizado */
  emptyState?: React.ReactNode;
  /** Mostrar loader */
  loading?: boolean;
}

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

  return (
    <div className="rounded-lg border border-border bg-card p-3 md:p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-2 md:mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-xs md:text-sm font-semibold capitalize truncate">{title}</p>
            {formulaTooltip && (
              <button
                type="button"
                onClick={() => setShowFormula((s) => !s)}
                className="text-muted-foreground hover:text-primary transition-colors"
                aria-label="Cómo se calcula"
              >
                <Info className="h-3 w-3 md:h-3.5 md:w-3.5" />
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
            className={cn(
              'grid gap-px mb-1',
              `ml-[${labelColWidth.mobile}px] md:ml-[${labelColWidth.desktop}px]`
            )}
            style={{
              marginLeft: `var(--label-col-w)`,
              gridTemplateColumns: `repeat(${columns.length}, var(--cell-size)) 1fr`,
              ['--label-col-w' as string]: `${labelColWidth.mobile}px`,
              ['--cell-size' as string]: '14px',
            } as React.CSSProperties}
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
                  style={{ width: 'var(--label-col-w-row)', ['--label-col-w-row' as string]: `${labelColWidth.mobile}px` } as React.CSSProperties}
                >
                  {row.label}
                </div>
                <div
                  className="grid gap-px"
                  style={{
                    gridTemplateColumns: `repeat(${columns.length}, var(--cell-size-row))`,
                    ['--cell-size-row' as string]: '14px',
                  } as React.CSSProperties}
                >
                  {columns.map((col, idx) => {
                    const value = row.values[idx] ?? 0;
                    return (
                      <div
                        key={`cell-${row.id}-${idx}`}
                        className="rounded-sm h-3.5 w-3.5"
                        style={{ backgroundColor: colorFn(value, max) }}
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

      {/* Tailwind responsive sizes — applied via inline style overrides above with media query */}
      <style jsx>{`
        @media (min-width: 768px) {
          :global(.rounded-lg [style*='--label-col-w']) {
            --label-col-w: ${labelColWidth.desktop}px !important;
            --label-col-w-row: ${labelColWidth.desktop}px !important;
            --cell-size: ${desktopCellSize}px !important;
            --cell-size-row: ${desktopCellSize}px !important;
          }
          :global(.rounded-lg [style*='--cell-size']) > div {
            height: ${desktopCellSize}px !important;
            width: ${desktopCellSize}px !important;
          }
        }
      `}</style>
    </div>
  );
}
