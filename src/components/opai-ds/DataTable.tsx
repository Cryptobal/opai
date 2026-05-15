"use client";

/**
 * OPAI DS v3 — DataTable
 *
 * Tabla unificada con:
 *  - Header sticky en desktop con tipografía ds-text-4 mono uppercase 11px
 *  - Filas con border-subtle, hover ds-surface-2, transición 120ms
 *  - Padding p-3 mobile / p-3.5 desktop (no p-2.5 apretado)
 *  - Mobile: oculta automático (debe complementarse con render alternativo)
 *  - Cell helpers: align right para números, ds-num automático en numeric
 *  - Empty state inline integrado
 *
 * Para mobile, el patrón es: render una lista de Surfaces y la tabla con
 * className="hidden sm:block".
 */

import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Spinner } from "./Spinner";

export interface DataTableColumn<T> {
  /** ID único. */
  id: string;
  /** Header label. */
  header: ReactNode;
  /** Cell renderer. */
  cell: (row: T, index: number) => ReactNode;
  /** Alineación. Si es 'right', aplica ds-num automáticamente. */
  align?: "left" | "right" | "center";
  /** Ancho fijo opcional (ej. "w-32"). */
  width?: string;
  /** Esconder en mobile. */
  hideOnMobile?: boolean;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  /**
   * Layout de la tabla.
   *  - `"auto"` (default): comportamiento actual, columnas se ajustan al contenido.
   *  - `"fixed"`: `table-layout: fixed` — los anchos de columna mandan y el
   *    contenido con `truncate` se recorta correctamente. Requiere que las
   *    columnas definan `width` y que las celdas usen `truncate`/`min-w-0`.
   */
  layout?: "auto" | "fixed";
  /** ID stable para keys. */
  rowKey: (row: T, index: number) => string;
  /** Filas con highlight semántico (row tinted). */
  rowVariant?: (row: T) => "default" | "ok" | "warn" | "danger";
  /** onClick por fila. */
  onRowClick?: (row: T) => void;
  loading?: boolean;
  /** Contenido cuando rows.length === 0 y !loading. */
  empty?: ReactNode;
  className?: string;
}

const ROW_VARIANT_BG = {
  default: "",
  ok:      "bg-status-ok-soft/40",
  warn:    "bg-status-warn-soft/40",
  danger:  "bg-status-danger-soft/40",
};

export function DataTable<T>({
  columns,
  rows,
  layout = "auto",
  rowKey,
  rowVariant,
  onRowClick,
  loading = false,
  empty,
  className,
}: DataTableProps<T>) {
  if (loading) {
    return (
      <div className="rounded-ds-lg border border-ds-border-default bg-ds-surface-1 py-12">
        <Spinner block label="Cargando…" />
      </div>
    );
  }
  if (!loading && rows.length === 0) {
    return (
      <div className="rounded-ds-lg border border-ds-border-default bg-ds-surface-1">
        {empty}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-ds-lg border border-ds-border-default bg-ds-surface-1",
        className,
      )}
    >
      <div className="ds-scroll-x">
        <table
          className={cn("w-full text-sm", layout === "fixed" && "table-fixed")}
        >
          <thead className="bg-ds-surface-3 border-b border-ds-border-subtle">
            <tr>
              {columns.map((c) => (
                <th
                  key={c.id}
                  className={cn(
                    "px-3.5 py-2.5 text-[11px] font-mono uppercase tracking-[0.08em] text-ds-text-4 font-medium",
                    c.align === "right" ? "text-right" :
                    c.align === "center" ? "text-center" :
                    "text-left",
                    c.width,
                    c.hideOnMobile && "hidden sm:table-cell",
                  )}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const variant = rowVariant ? rowVariant(row) : "default";
              return (
                <tr
                  key={rowKey(row, i)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    "border-b border-ds-border-subtle last:border-b-0 transition-colors",
                    ROW_VARIANT_BG[variant],
                    onRowClick && "cursor-pointer hover:bg-ds-surface-2",
                  )}
                >
                  {columns.map((c) => (
                    <td
                      key={c.id}
                      className={cn(
                        "px-3.5 py-3 text-ds-text-1",
                        c.align === "right" ? "text-right ds-num" :
                        c.align === "center" ? "text-center" :
                        "text-left",
                        c.hideOnMobile && "hidden sm:table-cell",
                      )}
                    >
                      {c.cell(row, i)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
