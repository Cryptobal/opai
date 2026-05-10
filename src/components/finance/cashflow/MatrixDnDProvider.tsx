"use client";
import type { ReactNode } from "react";
import { DndContext, type DragEndEvent } from "@dnd-kit/core";

interface Props {
  children: ReactNode;
  onMove: (occurrenceId: string, targetBucketKey: string) => void;
}

/**
 * Wrapper de DndContext para la matriz de proyección.
 *
 * Convención de IDs:
 *  - draggable: `occ-<occurrenceId>`
 *  - droppable: bucketKey (ej: "2026-W18", "2026-05")
 *
 * Si se suelta sobre una zona no-droppable o sobre la misma celda de origen,
 * onMove no se invoca.
 */
export function MatrixDnDProvider({ children, onMove }: Props) {
  function handleDragEnd(e: DragEndEvent) {
    if (!e.over) return;
    const activeId = String(e.active.id);
    const overId = String(e.over.id);
    if (!activeId.startsWith("occ-")) return;
    const occId = activeId.slice("occ-".length);
    onMove(occId, overId);
  }
  return <DndContext onDragEnd={handleDragEnd}>{children}</DndContext>;
}
