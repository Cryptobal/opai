"use client";
import type { ReactNode } from "react";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";

interface Props {
  children: ReactNode;
  onMove: (occurrenceId: string, targetBucketKey: string) => void;
}

/**
 * Wrapper de DndContext para la matriz de proyección.
 *
 * Sensores configurados:
 *  - PointerSensor: distance=8 — el clic suelto inicia popover, el movimiento
 *    de >8px inicia drag.
 *  - TouchSensor: long-press 250ms con tolerance 8px — el handle explícito
 *    permite un timing más generoso sin colisionar con scroll vertical.
 *  - KeyboardSensor: accesibilidad.
 *
 * Convención de IDs:
 *  - draggable: `occ-<occurrenceId>` (lo emite el <DragHandle />)
 *  - droppable: bucketKey (ej: "2026-W18", "2026-05") tanto en filas colapsadas
 *    como en sub-filas — el id del droppable es siempre directamente el bucket.
 */
export function MatrixDnDProvider({ children, onMove }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  function handleDragEnd(e: DragEndEvent) {
    if (!e.over) return;
    const activeId = String(e.active.id);
    const overId = String(e.over.id);
    if (!activeId.startsWith("occ-")) return;
    const occId = activeId.slice("occ-".length);
    onMove(occId, overId);
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      {children}
    </DndContext>
  );
}
