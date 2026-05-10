"use client";
import { useDraggable } from "@dnd-kit/core";
import { GripVertical } from "lucide-react";

interface Props {
  /** UUID si la cuota ya está materializada en FinanceCashflowOccurrence. */
  occurrenceId: string | null;
  /** Item dueño — necesario para materializar al hacer drop si la cuota es virtual. */
  itemId: string;
  /** Fecha original de la cuota (yyyy-MM-dd). */
  originalDate: string;
  className?: string;
}

// Drag handle explícito. Encodea toda la info necesaria en el id del draggable
// (`occ-<uuid>` o `virt-<itemId>-<originalDate>`) para que el handler de drop
// decida si materializar primero o usar el id directo. `touchAction: "none"`
// es crítico en móvil: evita que el browser intercepte el touch para scroll
// mientras el dedo está sobre el handle.
export function DragHandle({ occurrenceId, itemId, originalDate, className = "" }: Props) {
  const canDrag = Boolean(itemId && (occurrenceId || originalDate));
  const dragId = occurrenceId
    ? `occ-${occurrenceId}`
    : `virt-${itemId}-${originalDate}`;
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: dragId,
    disabled: !canDrag,
  });
  const style: React.CSSProperties = {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    cursor: canDrag ? (isDragging ? "grabbing" : "grab") : "default",
    opacity: isDragging ? 0.5 : canDrag ? 1 : 0.25,
    touchAction: "none",
  };
  return (
    <span
      ref={setNodeRef}
      style={style}
      {...(canDrag ? listeners : {})}
      {...(canDrag ? attributes : {})}
      className={`inline-flex items-center justify-center w-6 h-6 sm:w-5 sm:h-5 rounded-ds-sm hover:bg-muted/40 ${className}`}
      aria-label={canDrag ? "Arrastrar" : "Sin movimiento disponible"}
      role="button"
      tabIndex={canDrag ? 0 : -1}
    >
      <GripVertical className="h-3.5 w-3.5 text-ds-text-3" />
    </span>
  );
}
