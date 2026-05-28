"use client";

/**
 * OPAI DS v3 — DataTable
 *
 * Tabla unificada con:
 *  - Header con tipografía ds-text-3 mono uppercase 11px (legible en dark)
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
  /**
   * Si "right", esta columna queda fija al borde derecho cuando la tabla
   * tiene overflow horizontal. Útil para acciones (papelera, menú) que
   * deben quedar siempre accesibles aunque el resto haga scroll.
   * Renderiza con sombra sutil hacia la izquierda para indicar el corte.
   */
  sticky?: "right";
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
  stickyHeader?: boolean;
  stickyHeaderTopClass?: string;
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
  stickyHeader = false,
  stickyHeaderTopClass = "top-12",
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
        // overflow-x-auto (no overflow-hidden): overflow-hidden recortaba los
        // labels del thead en dark mode y hacía que la 1ª fila pareciera
        // quedar "detrás" de los índices de columna.
        "rounded-ds-lg border border-ds-border-default bg-ds-surface-1 ds-scroll-x overflow-x-auto",
        className,
      )}
    >
      <table
        className={cn(
          "w-full text-sm border-separate border-spacing-0",
          layout === "fixed" && "table-fixed",
        )}
      >
        {layout === "fixed" && (
          <colgroup>
            {columns.map((c) => (
              <col key={c.id} className={c.width} />
            ))}
          </colgroup>
        )}
        <thead
          className={cn(
            "bg-ds-surface-3 border-b border-ds-border-subtle",
            stickyHeader ? "sticky z-20 shadow-[0_1px_0_0_hsl(var(--ds-border-subtle))]" : "relative z-10",
            stickyHeader && stickyHeaderTopClass,
          )}
        >
          <tr>
            {columns.map((c) => (
              <th
                key={c.id}
                scope="col"
                className={cn(
                  "px-3.5 py-3 text-[11px] font-mono uppercase tracking-[0.08em] text-ds-text-3 font-medium leading-snug whitespace-nowrap",
                  layout === "fixed" && c.sticky !== "right" && "max-w-0 overflow-hidden",
                  c.align === "right" ? "text-right" :
                  c.align === "center" ? "text-center" :
                  "text-left",
                  c.width,
                  c.hideOnMobile && "hidden sm:table-cell",
                  c.sticky === "right" &&
                    "sticky right-0 z-10 bg-ds-surface-3 shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.35)]",
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="relative z-0 bg-ds-surface-1">
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
                      // table-fixed: max-w-0 + overflow-hidden evita que el
                      // contenido invada la columna vecina (ej. Receptor → Tipo).
                      "px-3.5 py-3 text-ds-text-1 align-top min-w-0 overflow-hidden",
                      layout === "fixed" && c.sticky !== "right" && "max-w-0",
                      c.align === "right" ? "text-right ds-num" :
                      c.align === "center" ? "text-center" :
                      "text-left",
                      c.hideOnMobile && "hidden sm:table-cell",
                      c.sticky === "right" &&
                        "sticky right-0 z-[1] bg-inherit shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.35)]",
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
  );
}
