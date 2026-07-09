"use client";

import { useDraggable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import type { ProjectionRowItemValue } from "@/modules/finance/cashflow/types";
import { GridChip } from "./GridChip";
import type { GridDragData } from "./useGridMove";

/**
 * Chip arrastrable (dnd-kit) de una celda item×semana. Empaqueta en `data`
 * todo lo que necesita el move unificado y el overlay de arrastre. Se separa de
 * GridCell para poder llamar el hook `useDraggable` por celda sin condicionales.
 */
export function GridDraggableChip({
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
      <GridChip amount={amount} variant={variant} locked={locked} draggable title={title} />
    </span>
  );
}
