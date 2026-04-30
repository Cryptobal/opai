"use client";

/**
 * OPAI DS v3 — DataView
 *
 * Renderer adaptativo: misma config (columns + rows) genera tabla en
 * desktop y lista de cards en mobile. El usuario nunca ve el cambio
 * entre componentes — es la misma vista escalando.
 *
 *   - Desktop (>=md): DataTable estándar con sticky header.
 *   - Mobile (<md):   lista de Surfaces apilables. Cada card tiene
 *                     header (leading + primary + secondary + badge),
 *                     body (campos con label) y opcional footer.
 *
 * Cada DataViewColumn incluye `mobile` que indica su rol en la card:
 *   - "primary"   → título principal de la card.
 *   - "secondary" → subtítulo (debajo del título).
 *   - "badge"     → tag/badge a la derecha del header.
 *   - "leading"   → contenido a la izquierda (típicamente IconTile).
 *   - "field"     → par label-valor en el body (default).
 *   - "footer"    → bloque de footer (acciones, totales).
 *   - "hidden"    → no aparece en mobile.
 *
 * Cuando no se define ningún rol, DataView intenta heurística:
 * la primera columna es "primary", el resto son "field".
 */

import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { DataTable, type DataTableColumn, type DataTableProps } from "./DataTable";
import { Spinner } from "./Spinner";

export type MobileSlot =
  | "primary"
  | "secondary"
  | "badge"
  | "leading"
  | "field"
  | "footer"
  | "hidden";

export interface DataViewColumn<T> extends DataTableColumn<T> {
  /** Rol que ocupa esta columna en la card mobile. Default: "field". */
  mobile?: MobileSlot;
  /** Label visible en mobile cuando el rol es "field". Default: usa `header`. */
  mobileLabel?: ReactNode;
}

export interface DataViewProps<T>
  extends Omit<DataTableProps<T>, "columns"> {
  columns: DataViewColumn<T>[];
}

export function DataView<T>({
  columns,
  rows,
  rowKey,
  rowVariant,
  onRowClick,
  loading = false,
  empty,
  className,
}: DataViewProps<T>) {
  // Aplicar heurística: si ninguna columna tiene `mobile` definido, la
  // primera es "primary" y el resto "field". Así el componente funciona
  // out of the box sin config explícita.
  const hasExplicitRoles = columns.some((c) => c.mobile);
  const resolved: DataViewColumn<T>[] = hasExplicitRoles
    ? columns
    : columns.map((c, i) => ({ ...c, mobile: i === 0 ? "primary" : "field" }));

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
    <>
      {/* Desktop: tabla estándar. */}
      <div className={cn("hidden md:block", className)}>
        <DataTable
          columns={resolved}
          rows={rows}
          rowKey={rowKey}
          rowVariant={rowVariant}
          onRowClick={onRowClick}
          loading={false}
          empty={empty}
        />
      </div>

      {/* Mobile: cards apilables. */}
      <ul className={cn("md:hidden flex flex-col gap-2.5", className)}>
        {rows.map((row, i) => (
          <DataViewMobileCard
            key={rowKey(row, i)}
            row={row}
            index={i}
            columns={resolved}
            variant={rowVariant ? rowVariant(row) : "default"}
            onClick={onRowClick}
          />
        ))}
      </ul>
    </>
  );
}

// ───────────────────────────────────────────────────────────────────
// Card mobile interna
// ───────────────────────────────────────────────────────────────────

interface DataViewMobileCardProps<T> {
  row: T;
  index: number;
  columns: DataViewColumn<T>[];
  variant: "default" | "ok" | "warn" | "danger";
  onClick?: (row: T) => void;
}

const VARIANT_BORDER = {
  default: "border-ds-border-default",
  ok:      "border-status-ok-border",
  warn:    "border-status-warn-border",
  danger:  "border-status-danger-border",
};

function DataViewMobileCard<T>({
  row,
  index,
  columns,
  variant,
  onClick,
}: DataViewMobileCardProps<T>) {
  const leading = columns.find((c) => c.mobile === "leading");
  const primary = columns.find((c) => c.mobile === "primary");
  const secondary = columns.find((c) => c.mobile === "secondary");
  const badge = columns.find((c) => c.mobile === "badge");
  const fields = columns.filter((c) => c.mobile === "field");
  const footer = columns.find((c) => c.mobile === "footer");

  const cardClasses = cn(
    "w-full text-left rounded-ds-lg border bg-ds-surface-1 block",
    "shadow-ds-xs transition-colors duration-200 ease-[cubic-bezier(0.2,0,0,1)]",
    VARIANT_BORDER[variant],
    onClick && "active:bg-ds-surface-2 hover:border-ds-border-strong cursor-pointer",
  );

  const inner = (
    <>
      {(leading || primary || secondary || badge) && (
        <div className="flex items-start gap-3 p-4">
          {leading && (
            <div className="shrink-0">{leading.cell(row, index)}</div>
          )}
          <div className="min-w-0 flex-1">
            {primary && (
              <div className="text-sm font-medium text-ds-text-1 truncate">
                {primary.cell(row, index)}
              </div>
            )}
            {secondary && (
              <div className="text-xs text-ds-text-3 truncate mt-0.5">
                {secondary.cell(row, index)}
              </div>
            )}
          </div>
          {badge && <div className="shrink-0">{badge.cell(row, index)}</div>}
        </div>
      )}

      {fields.length > 0 && (
        <dl
          className={cn(
            "grid grid-cols-2 gap-x-4 gap-y-2 px-4 pb-4",
            (leading || primary || secondary || badge)
              ? "border-t border-ds-border-subtle pt-3"
              : "pt-4",
          )}
        >
          {fields.map((c) => (
            <div key={c.id} className="min-w-0">
              <dt className="text-[11px] font-mono uppercase tracking-[0.08em] text-ds-text-4">
                {c.mobileLabel ?? c.header}
              </dt>
              <dd
                className={cn(
                  "text-sm text-ds-text-1 truncate mt-0.5",
                  c.align === "right" && "ds-num",
                )}
              >
                {c.cell(row, index)}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {footer && (
        <div className="px-4 py-3 border-t border-ds-border-subtle">
          {footer.cell(row, index)}
        </div>
      )}
    </>
  );

  return (
    <li className="list-none">
      {onClick ? (
        <button
          type="button"
          onClick={() => onClick(row)}
          className={cardClasses}
        >
          {inner}
        </button>
      ) : (
        <div className={cardClasses}>{inner}</div>
      )}
    </li>
  );
}
