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
        "rounded-ds-lg border border-ds-border-default bg-ds-surface-1",
        !stickyHeader && "overflow-hidden",
        className,
      )}
    >
      <div className="ds-scroll-x">
        <table
          className={cn("w-full text-sm", layout === "fixed" && "table-fixed")}
        >
          <thead
            className={cn(
              "bg-ds-surface-3 border-b border-ds-border-subtle",
              stickyHeader && "sticky z-20",
              stickyHeader && stickyHeaderTopClass,
            )}
          >
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
                    // Sticky right: la columna queda pegada al borde derecho
                    // mientras el resto hace scroll horizontal. La sombra
                    // izquierda da el corte visual entre stick y scrolling.
                    c.sticky === "right" &&
                      "sticky right-0 z-10 bg-ds-surface-3 shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.35)]",
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
                        // Filas altas alineadas arriba; min-w-0 + overflow-x-hidden
                        // evitan que contenido nowrap/flex invada la celda siguiente en `table-fixed`.
                        "px-3.5 py-3 text-ds-text-1 align-top min-w-0 overflow-x-hidden",
                        c.align === "right" ? "text-right ds-num" :
                        c.align === "center" ? "text-center" :
                        "text-left",
                        c.hideOnMobile && "hidden sm:table-cell",
                        // Sticky right: la celda debe heredar el background
                        // del rowVariant para no dejar transparente el contenido
                        // que pasa por debajo. Usamos bg-inherit y dejamos que
                        // el `bg-*` del rowVariant en el <tr> lo cubra cuando
                        // existe.
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
    </div>
  );
}
