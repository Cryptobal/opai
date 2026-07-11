"use client";

import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProjectionBucket } from "@/modules/finance/cashflow/types";
import { GridCell } from "./GridCell";
import { rowLabels, type BucketMeta, type GridItemRow } from "./grid-helpers";

/**
 * Fila de la grilla para una línea de contrato/instalación. Columna cliente
 * sticky (cliente + tag instalación/nickname + badge UF) y una celda por
 * semana con el chip de cuota (color por etapa del DTE, arrastrable). El
 * sellado por cierre (`bucketMeta`) atenúa y bloquea las semanas cerradas.
 *
 * Cuando la fila es una cuenta de egreso agrupada (B3), `expandable` la
 * convierte en clickeable con un caret accesible; sus movimientos se renderizan
 * como filas hijas (`isChild`) indentadas.
 */
export function GridRow({
  row,
  buckets,
  currentIdx,
  dndEnabled,
  bucketMeta,
  advanced,
  onAmountSaved,
  isMobile,
  editableAmounts,
  expandable,
  isChild,
}: {
  row: GridItemRow;
  buckets: ProjectionBucket[];
  currentIdx: number;
  dndEnabled: boolean;
  bucketMeta?: Map<string, BucketMeta>;
  /** Modo avanzado: revela badge IPC y headcount en la columna cliente. */
  advanced?: boolean;
  /** Refresca la proyección tras editar/revertir el monto de una casilla. */
  onAmountSaved?: () => void;
  /** Móvil: editar por tap + lápiz de affordance en las celdas editables. */
  isMobile?: boolean;
  /** La sección admite editar montos (solo Egresos; ver GridCell). */
  editableAmounts?: boolean;
  /** Fila expandible (cuenta de conciliación): caret + toggle. */
  expandable?: { open: boolean; onToggle: () => void };
  /** Sub-fila hija de una cuenta expandida: indentada y atenuada. */
  isChild?: boolean;
}) {
  const group = row.group;
  const { primary, tag } = rowLabels(row.item);
  const isUf = row.item.currency === "UF";
  const headcount = row.item.headcount;
  const childCount = row.item.children?.length ?? 0;
  const open = expandable?.open ?? false;
  const isExtra = !!row.item.isExtraInvoice;
  return (
    <tr
      className={cn(
        "border-b border-ds-border-subtle hover:bg-ds-surface-2/60",
        expandable && "cursor-pointer select-none",
        isChild && "bg-ds-surface-2/40",
      )}
      onClick={expandable ? expandable.onToggle : undefined}
    >
      <td
        className={cn(
          "sticky left-0 z-10 min-w-[160px] max-w-[220px] max-md:min-w-[100px] max-md:max-w-[128px] border-r border-ds-border-default bg-ds-surface-1 p-2",
          isChild && "bg-ds-surface-2/40 pl-8",
          isExtra && "pl-6",
        )}
      >
        <div className="flex items-center gap-1.5">
          {expandable && (
            <button
              type="button"
              aria-expanded={open}
              aria-label={`${open ? "Contraer" : "Expandir"} cuenta ${primary}`}
              onClick={(e) => {
                e.stopPropagation();
                expandable.onToggle();
              }}
              className="-m-1 shrink-0 rounded-ds-sm p-1 text-ds-text-3 hover:bg-ds-surface-3 hover:text-ds-text-1"
            >
              <ChevronRight
                className={cn(
                  "h-3.5 w-3.5 transition-transform",
                  open && "rotate-90",
                )}
              />
            </button>
          )}
          <span
            className={cn(
              "truncate font-medium text-ds-text-1",
              isChild ? "text-[12px] text-ds-text-3" : "text-[13px]",
            )}
          >
            {primary}
          </span>
          {isExtra && (
            <span
              className="shrink-0 rounded-ds-sm bg-tint-violet-soft px-1 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.04em] text-tint-violet-fg"
              title="Factura adicional de la misma semana"
            >
              + EXTRA
            </span>
          )}
          {isUf && (
            <span className="shrink-0 rounded-ds-sm bg-ds-surface-3 px-1 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.04em] text-ds-text-2">
              UF
            </span>
          )}
          {advanced && row.item.hasIpcAdjustment && (
            <span
              className="shrink-0 rounded-ds-sm bg-tint-violet-soft px-1 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.04em] text-tint-violet-fg"
              title={`Reajuste IPC${row.item.ipcAdjustmentMonths ? ` cada ${row.item.ipcAdjustmentMonths} meses` : ""}`}
            >
              IPC
            </span>
          )}
        </div>
        {expandable && childCount > 0 ? (
          <div className="truncate pl-[1.375rem] text-[12px] text-ds-text-3">
            {childCount} movimiento{childCount === 1 ? "" : "s"}
          </div>
        ) : (
          tag && (
            <div className="truncate text-[12px] text-ds-text-3">
              {tag}
              {advanced && headcount > 0 && (
                <span className="text-ds-text-4"> · {headcount} pers.</span>
              )}
            </div>
          )
        )}
      </td>
      {buckets.map((b, i) => {
        const meta = bucketMeta?.get(b.key);
        return (
          <GridCell
            key={b.key}
            itemId={row.item.itemId}
            itemName={row.item.nickname ?? row.item.itemName}
            source={row.item.source}
            value={row.valueByBucket.get(b.key)}
            bucketKey={b.key}
            isCurrent={i === currentIdx}
            dndEnabled={dndEnabled}
            closed={meta?.closed ?? false}
            isAnchor={meta?.anchor ?? false}
            advanced={advanced}
            isGroup={!!group}
            groupOccurrences={group?.occurrencesByBucket.get(b.key)}
            onAmountSaved={onAmountSaved}
            isMobile={isMobile}
            editableAmounts={editableAmounts}
          />
        );
      })}
    </tr>
  );
}
