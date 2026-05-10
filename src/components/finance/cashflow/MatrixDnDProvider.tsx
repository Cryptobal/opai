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
  /** Cuando el origen del drag tiene id materializado. */
  onMoveById: (occurrenceId: string, targetBucketKey: string) => void;
  /** Cuando el origen es virtual: el server materializa antes de mover. */
  onMoveVirtual: (
    itemId: string,
    originalDate: string,
    targetBucketKey: string,
  ) => void;
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
 *  - draggable materializado: `occ-<occurrenceId>` → onMoveById
 *  - draggable virtual: `virt-<itemId>-<yyyy-MM-dd>` → onMoveVirtual
 *  - droppable: bucketKey (ej: "2026-W18", "2026-05") en filas y sub-filas.
 */
export function MatrixDnDProvider({ children, onMoveById, onMoveVirtual }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  function handleDragEnd(e: DragEndEvent) {
    if (!e.over) return;
    const activeId = String(e.active.id);
    const overId = String(e.over.id);
    if (activeId.startsWith("occ-")) {
      const occId = activeId.slice("occ-".length);
      onMoveById(occId, overId);
      return;
    }
    if (activeId.startsWith("virt-")) {
      // virt-<itemId>-<yyyy-MM-dd>
      // Los UUIDs v4 son siempre 36 chars; la fecha viene después de un guion.
      const rest = activeId.slice("virt-".length);
      const itemId = rest.slice(0, 36);
      const originalDate = rest.slice(37);
      if (itemId && originalDate) {
        onMoveVirtual(itemId, originalDate, overId);
      }
    }
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      {children}
    </DndContext>
  );
}
