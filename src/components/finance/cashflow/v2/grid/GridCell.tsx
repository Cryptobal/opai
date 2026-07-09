"use client";

import { useDraggable, useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import type {
  FinanceCashflowItemSource,
  ProjectionRowItemValue,
} from "@/modules/finance/cashflow/types";
import { GridChip } from "./GridChip";
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
  bucketClosed = false,
}: {
  itemId: string;
  itemName: string;
  source: FinanceCashflowItemSource;
  value: ProjectionRowItemValue | undefined;
  bucketKey: string;
  isCurrent: boolean;
  dndEnabled: boolean;
  /** Semana sellada (cierre): sin arrastre ni drop. Lo aplica B5. */
  bucketClosed?: boolean;
}) {
  const amount = value?.amount ?? 0;
  const chip = value ? cellChip(value, source) : null;
  const canDrag =
    dndEnabled && !bucketClosed && amount !== 0 && !!chip?.draggable;

  const { setNodeRef: setDropRef, isOver, active } = useDroppable({
    id: `drop::${itemId}::${bucketKey}`,
    data: { itemId, bucketKey },
    disabled: !dndEnabled || bucketClosed,
  });
  const activeItemId = (active?.data.current as GridDragData | undefined)?.itemId;
  const validTarget = isOver && activeItemId === itemId;

  return (
    <td
      ref={setDropRef}
      className={cn(
        "border-l border-ds-border-subtle px-1.5 py-1.5 text-center align-middle",
        isCurrent && "bg-primary/[0.04]",
        validTarget && "bg-primary/10 ring-2 ring-inset ring-primary",
      )}
    >
      {amount !== 0 && chip ? (
        canDrag && value ? (
          <DraggableChip
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
    </td>
  );
}

function DraggableChip({
  itemId,
  itemName,
  value,
  bucketKey,
  amount,
  variant,
  locked,
  title,
}: {
  itemId: string;
  itemName: string;
  value: ProjectionRowItemValue;
  bucketKey: string;
  amount: number;
  variant: React.ComponentProps<typeof GridChip>["variant"];
  locked: boolean;
  title: string;
}) {
  const data: GridDragData = {
    kind: "grid-chip",
    itemId,
    itemName,
    occurrenceId: value.occurrenceId,
    dteId: value.dteId ?? null,
    originalDate: value.scheduledDate,
    fromBucketKey: bucketKey,
    amount,
    variant,
    locked,
  };
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `drag::${itemId}::${bucketKey}`,
    data,
  });
  return (
    <span
      ref={setNodeRef}
      className={cn("inline-block touch-none", isDragging && "opacity-40")}
      {...listeners}
      {...attributes}
    >
      <GridChip
        amount={amount}
        variant={variant}
        locked={locked}
        draggable
        title={title}
      />
    </span>
  );
}
