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
 *  - TouchSensor: long-press 200ms con tolerance 5px — separa tap (popover)
 *    de drag para móvil sin colisionar con scroll.
 *  - KeyboardSensor: accesibilidad.
 *
 * Convención de IDs:
 *  - draggable: `occ-<occurrenceId>`
 *  - droppable: bucketKey (ej: "2026-W18", "2026-05") o `subcell:<bucketKey>:...`
 *    para sub-filas (extraemos el bucketKey antes de propagar).
 */
export function MatrixDnDProvider({ children, onMove }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor),
  );

  function handleDragEnd(e: DragEndEvent) {
    if (!e.over) return;
    const activeId = String(e.active.id);
    const overId = String(e.over.id);
    if (!activeId.startsWith("occ-")) return;
    const occId = activeId.slice("occ-".length);
    // Las sub-celdas usan IDs `subcell:<bucketKey>:<occurrenceId|none>`;
    // extraemos solo el bucketKey para que el endpoint de move reciba un valor
    // consistente con la fila colapsada.
    const bucketKey = overId.startsWith("subcell:")
      ? overId.split(":")[1]
      : overId;
    onMove(occId, bucketKey);
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      {children}
    </DndContext>
  );
}
