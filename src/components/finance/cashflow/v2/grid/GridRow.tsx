"use client";

import type { ProjectionBucket } from "@/modules/finance/cashflow/types";
import { GridCell } from "./GridCell";
import { rowLabels, type GridItemRow } from "./grid-helpers";

/**
 * Fila de la grilla para una línea de contrato/instalación. Columna cliente
 * sticky (cliente + tag instalación/nickname + badge UF) y una celda por
 * semana con el chip de cuota (color por etapa del DTE). El arrastre se cablea
 * en B4.
 */
export function GridRow({
  row,
  buckets,
  currentIdx,
  dndEnabled,
  closedBucketKeys,
}: {
  row: GridItemRow;
  buckets: ProjectionBucket[];
  currentIdx: number;
  dndEnabled: boolean;
  /** Claves de buckets sellados (semana cerrada). Aplicado en B5. */
  closedBucketKeys?: ReadonlySet<string>;
}) {
  const { primary, tag } = rowLabels(row.item);
  const isUf = row.item.currency === "UF";
  return (
    <tr className="border-b border-ds-border-subtle hover:bg-ds-surface-2/60">
      <td className="sticky left-0 z-10 min-w-[160px] max-w-[220px] border-r border-ds-border-default bg-ds-surface-1 p-2">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[13px] font-medium text-ds-text-1">
            {primary}
          </span>
          {isUf && (
            <span className="shrink-0 rounded-ds-sm bg-ds-surface-3 px-1 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.04em] text-ds-text-2">
              UF
            </span>
          )}
        </div>
        {tag && (
          <div className="truncate text-[12px] text-ds-text-3">{tag}</div>
        )}
      </td>
      {buckets.map((b, i) => (
        <GridCell
          key={b.key}
          itemId={row.item.itemId}
          itemName={row.item.nickname ?? row.item.itemName}
          source={row.item.source}
          value={row.valueByBucket.get(b.key)}
          bucketKey={b.key}
          isCurrent={i === currentIdx}
          dndEnabled={dndEnabled}
          bucketClosed={closedBucketKeys?.has(b.key) ?? false}
        />
      ))}
    </tr>
  );
}
