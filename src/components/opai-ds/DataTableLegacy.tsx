"use client";

/**
 * OPAI DS — DataTableLegacy
 *
 * Wrapper API-compatible con el legacy `@/components/opai/DataTable.tsx`.
 *
 * Mantiene la API antigua (columns con key/label/render, data array,
 * emptyMessage string, compact, mobileCardView) en un namespace separado
 * (`@/components/opai-ds`) preparado para la migración progresiva de cada
 * call site al DataTable nativo del DS.
 *
 * NO se debe usar este wrapper en código nuevo — su única razón de ser es
 * preservar la API legacy mientras los 7 call sites se migran uno a uno.
 */
import { type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { EmptyState, LoadingState } from "@/components/opai";

export interface DataTableColumn {
  key: string;
  label: string;
  className?: string;
  /** Hide this column in mobile card view */
  hideOnMobile?: boolean;
  render?: (value: any, row: any) => ReactNode;
}

export interface DataTableProps {
  columns: DataTableColumn[];
  data: Array<Record<string, any>>;
  onRowClick?: (row: any) => void;
  emptyMessage?: string;
  loading?: boolean;
  compact?: boolean;
  mobileCardView?: boolean;
  className?: string;
}

/**
 * @deprecated Wrapper de compatibilidad con la API legacy. No usar en código
 * nuevo: importar directamente los building blocks del DS o el DataTable
 * nativo cuando esté disponible.
 */
export function DataTable({
  columns,
  data,
  onRowClick,
  emptyMessage = "No hay datos para mostrar",
  loading = false,
  compact = false,
  mobileCardView = true,
  className,
}: DataTableProps) {
  if (loading) {
    return <LoadingState type="skeleton" rows={5} className={className} />;
  }

  if (data.length === 0) {
    return <EmptyState title={emptyMessage} compact className={className} />;
  }

  const headerCellClasses = compact
    ? "px-3 py-2 text-left text-sm font-semibold text-muted-foreground uppercase tracking-wider bg-muted/50 border-b-2 border-border"
    : "px-4 py-3 text-left text-sm font-semibold text-muted-foreground uppercase tracking-wider bg-muted/50 border-b-2 border-border";

  const dataCellClasses = compact
    ? "px-3 py-2 text-sm sm:text-base text-foreground border-b border-border/50"
    : "px-4 py-2.5 text-sm sm:text-base text-foreground border-b border-border/50";

  const mobileColumns = columns.filter((c) => !c.hideOnMobile).slice(0, 4);

  return (
    <div className={cn(className)}>
      {mobileCardView && (
        <div className="md:hidden space-y-2">
          {data.map((row, rowIndex) => (
            <div
              key={row.id ?? rowIndex}
              className={cn(
                "rounded-lg border border-border bg-card p-3 space-y-1.5 transition-colors active:bg-muted/50",
                onRowClick && "cursor-pointer",
              )}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {mobileColumns.map((col, colIdx) => {
                const value = col.render ? col.render(row[col.key], row) : row[col.key];
                if (colIdx === 0) {
                  return (
                    <div
                      key={col.key}
                      className="text-base font-medium text-foreground truncate min-w-0"
                    >
                      {value}
                    </div>
                  );
                }
                return (
                  <div
                    key={col.key}
                    className="flex items-center justify-between gap-2 min-w-0"
                  >
                    <span className="text-sm text-muted-foreground shrink-0">{col.label}</span>
                    <span className="text-sm text-foreground truncate min-w-0 text-right">
                      {value}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      <div
        className={cn(
          "overflow-x-auto rounded-lg border border-border",
          mobileCardView && "hidden md:block",
        )}
      >
        <table className="w-full min-w-0">
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.key} className={cn(headerCellClasses, col.className)}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, rowIndex) => (
              <tr
                key={row.id ?? rowIndex}
                className={cn(
                  "hover:bg-muted/30 active:bg-muted/50 transition-colors",
                  onRowClick && "cursor-pointer",
                )}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((col) => (
                  <td key={col.key} className={cn(dataCellClasses, col.className)}>
                    {col.render ? col.render(row[col.key], row) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
