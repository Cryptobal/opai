/**
 * Wrapper DnD de una fila de turno dentro de un servicio.
 * Extraído para no hinchar GroupBlock en PositionMatrixGrid.
 */
"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  id: string;
  sortable: boolean;
  children: (ctx: {
    setNodeRef: (node: HTMLElement | null) => void;
    style: React.CSSProperties;
    isDragging: boolean;
    grip: ReactNode;
  }) => ReactNode;
}

export function SortableGridRow({ id, sortable, children }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: !sortable,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
  };

  const grip = sortable ? (
    <button
      type="button"
      className={cn(
        "cursor-grab touch-none text-muted-foreground/50 opacity-0 transition-opacity",
        "group-hover/row:opacity-100 hover:text-muted-foreground active:cursor-grabbing",
      )}
      aria-label="Arrastrar para reordenar turno"
      {...attributes}
      {...listeners}
    >
      <GripVertical className="h-3.5 w-3.5" />
    </button>
  ) : null;

  return <>{children({ setNodeRef, style, isDragging, grip })}</>;
}
