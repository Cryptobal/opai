"use client";

import type { ProjectionBucket } from "@/modules/finance/cashflow/types";
import { GridCell } from "./GridCell";
import { rowLabels, type BucketMeta, type GridItemRow } from "./grid-helpers";

/**
 * Fila de la grilla para una línea de contrato/instalación. Columna cliente
 * sticky (cliente + tag instalación/nickname + badge UF) y una celda por
 * semana con el chip de cuota (color por etapa del DTE, arrastrable). El
 * sellado por cierre (`bucketMeta`) atenúa y bloquea las semanas cerradas.
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
}) {
  const group = row.group;
  const { primary, tag } = rowLabels(row.item);
  const isUf = row.item.currency === "UF";
  const headcount = row.item.headcount;
  return (
    <tr className="border-b border-ds-border-subtle hover:bg-ds-surface-2/60">
      <td className="sticky left-0 z-10 min-w-[160px] max-w-[220px] max-md:min-w-[100px] max-md:max-w-[128px] border-r border-ds-border-default bg-ds-surface-1 p-2">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[13px] font-medium text-ds-text-1">
            {primary}
          </span>
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
        {tag && (
          <div className="truncate text-[12px] text-ds-text-3">
            {tag}
            {advanced && headcount > 0 && (
              <span className="text-ds-text-4"> · {headcount} pers.</span>
            )}
          </div>
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
