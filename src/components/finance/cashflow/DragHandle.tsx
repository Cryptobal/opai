"use client";
import { useDraggable } from "@dnd-kit/core";
import { GripVertical } from "lucide-react";

interface Props {
  occurrenceId: string | null;
  className?: string;
}

// Drag handle explícito. Solo este componente engancha listeners de DnD;
// el resto de la celda (incluido el botón del popover) recibe taps sin colisión.
// `touchAction: "none"` es crítico en móvil: evita que el browser intercepte
// el touch para scroll mientras el dedo está sobre el handle.
export function DragHandle({ occurrenceId, className = "" }: Props) {
  const dragId = occurrenceId ? `occ-${occurrenceId}` : "noop";
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: dragId,
    disabled: occurrenceId === null,
  });
  const style: React.CSSProperties = {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    cursor: occurrenceId ? (isDragging ? "grabbing" : "grab") : "default",
    opacity: isDragging ? 0.5 : occurrenceId ? 1 : 0.25,
    touchAction: "none",
  };
  return (
    <span
      ref={setNodeRef}
      style={style}
      {...(occurrenceId ? listeners : {})}
      {...(occurrenceId ? attributes : {})}
      className={`inline-flex items-center justify-center w-6 h-6 sm:w-5 sm:h-5 rounded-ds-sm hover:bg-muted/40 ${className}`}
      aria-label={occurrenceId ? "Arrastrar" : "Sin movimiento disponible"}
      role="button"
      tabIndex={occurrenceId ? 0 : -1}
    >
      <GripVertical className="h-3.5 w-3.5 text-ds-text-3" />
    </span>
  );
}
