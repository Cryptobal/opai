"use client";

import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import type {
  FinanceCashflowItemSource,
  ProjectionRowItemValue,
} from "@/modules/finance/cashflow/types";
import { fmt } from "@/components/finance/cashflow/MatrixHelpers";
import { GridChip } from "./GridChip";
import { GridDraggableChip } from "./GridDraggableChip";
import { cellChip } from "./grid-helpers";
import type { GridDragData } from "./useGridMove";

/**
 * Celda de la grilla (item × semana). Cuando el arrastre está habilitado y la
 * cuota es movible (no pagada, source arrastrable, semana abierta), el chip se
 * vuelve draggable y la celda droppable — el drop dispara el move unificado en
 * el padre. Solo son destino válido las columnas de la MISMA fila.
 */
export function GridCell({
  itemId,
  itemName,
  source,
  value,
  bucketKey,
  isCurrent,
  dndEnabled,
  closed = false,
  isAnchor = false,
  advanced = false,
}: {
  itemId: string;
  itemName: string;
  source: FinanceCashflowItemSource;
  value: ProjectionRowItemValue | undefined;
  bucketKey: string;
  isCurrent: boolean;
  dndEnabled: boolean;
  /** Semana sellada (cierre): sin arrastre ni drop, atenuada. */
  closed?: boolean;
  /** Semana anclada: dibuja la línea de ancla (borde derecho de acento). */
  isAnchor?: boolean;
  /** Modo avanzado: revela el monto real conciliado y la varianza (Δ). */
  advanced?: boolean;
}) {
  const amount = value?.amount ?? 0;
  const chip = value ? cellChip(value, source) : null;
  const canDrag = dndEnabled && !closed && amount !== 0 && !!chip?.draggable;
  // Varianza (real − proyectado): oculta por defecto, visible en avanzado.
  const actual = value?.actualAmount ?? null;
  const variance = actual !== null ? actual - amount : null;

  const { setNodeRef: setDropRef, isOver, active } = useDroppable({
    id: `drop::${itemId}::${bucketKey}`,
    data: { itemId, bucketKey },
    disabled: !dndEnabled || closed,
  });
  const activeItemId = (active?.data.current as GridDragData | undefined)?.itemId;
  const validTarget = isOver && activeItemId === itemId;

  return (
    <td
      ref={setDropRef}
      className={cn(
        "border-l border-ds-border-subtle px-1.5 py-1.5 text-center align-middle",
        isCurrent && "bg-primary/[0.04]",
        closed && "bg-ds-surface-2/50 opacity-60",
        isAnchor && "border-r-2 border-r-primary",
        validTarget && "bg-primary/10 ring-2 ring-inset ring-primary",
      )}
    >
      {amount !== 0 && chip ? (
        canDrag && value ? (
          <GridDraggableChip
            itemId={itemId}
            itemName={itemName}
            value={value}
            bucketKey={bucketKey}
            amount={amount}
            variant={chip.variant}
            locked={chip.locked}
            title={chip.title}
          />
        ) : (
          <GridChip
            amount={amount}
            variant={chip.variant}
            locked={chip.locked}
            title={chip.title}
          />
        )
      ) : (
        <span className="text-[12px] text-ds-text-4">·</span>
      )}
      {advanced && actual !== null && (
        <div
          className="mt-0.5 font-mono text-[11px] tabular-nums text-ds-text-3"
          title="Real conciliado (banco)"
        >
          {fmt.format(actual)}
          {variance !== null && variance !== 0 && (
            <span className="ml-1 text-ds-text-4">
              Δ{variance > 0 ? "+" : ""}
              {fmt.format(variance)}
            </span>
          )}
        </div>
      )}
    </td>
  );
}
