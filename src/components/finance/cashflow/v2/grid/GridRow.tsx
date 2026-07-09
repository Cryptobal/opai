"use client";

import { cn } from "@/lib/utils";
import type { ProjectionBucket } from "@/modules/finance/cashflow/types";
import { GridChip } from "./GridChip";
import { cellChip, rowLabels, type GridItemRow } from "./grid-helpers";

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
}: {
  row: GridItemRow;
  buckets: ProjectionBucket[];
  currentIdx: number;
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
      {buckets.map((b, i) => {
        const value = row.valueByBucket.get(b.key);
        const amount = value?.amount ?? 0;
        const chip = value ? cellChip(value, row.item.source) : null;
        return (
          <td
            key={b.key}
            className={cn(
              "border-l border-ds-border-subtle px-1.5 py-1.5 text-center align-middle",
              i === currentIdx && "bg-primary/[0.04]",
            )}
          >
            {amount !== 0 && chip ? (
              <GridChip
                amount={amount}
                variant={chip.variant}
                locked={chip.locked}
                draggable={chip.draggable}
                title={chip.title}
              />
            ) : (
              <span className="text-[12px] text-ds-text-4">·</span>
            )}
          </td>
        );
      })}
    </tr>
  );
}
