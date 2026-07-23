"use client";

import { useCallback, useRef } from "react";
import type { CellSel } from "./usePlanillaKeyboard";

const MAX_ENTRIES = 50;

export interface HistoryEntry {
  /** "mover", "editar", "rellenar"… + concepto + semana, para el toast. */
  label: string;
  /** Celda a la que volver el foco tras deshacer/rehacer. */
  focus: CellSel | null;
  /** Aplica el PATCH inverso (restaura el estado previo). */
  undo: () => Promise<void>;
  /** Reaplica la mutación. */
  redo: () => Promise<void>;
}

/**
 * Pila de deshacer/rehacer en memoria por sesión (§5A). Solo mutaciones de
 * PLAN (celda individual, fill-right, move). Tope 50. Cada undo/redo ejecuta un
 * PATCH real (read-after-write), nunca una mutación local: si la pila se
 * desincroniza de la base (semana sellada entre medio), el servidor rechaza y
 * el caller revierte. La pila se limpia al desplazar la ventana o cambiar de
 * granularidad (evita punteros a semanas ya no cargadas).
 */
export function usePlanillaHistory() {
  const undoStack = useRef<HistoryEntry[]>([]);
  const redoStack = useRef<HistoryEntry[]>([]);

  const push = useCallback((entry: HistoryEntry) => {
    undoStack.current.push(entry);
    if (undoStack.current.length > MAX_ENTRIES) undoStack.current.shift();
    redoStack.current = [];
  }, []);

  const undo = useCallback(async (): Promise<HistoryEntry | null> => {
    const entry = undoStack.current.pop();
    if (!entry) return null;
    try {
      await entry.undo();
    } catch (err) {
      // La reversión falló (p. ej. semana sellada entre medio): no reponer la
      // entrada y propagar para que el caller avise.
      throw err;
    }
    redoStack.current.push(entry);
    return entry;
  }, []);

  const redo = useCallback(async (): Promise<HistoryEntry | null> => {
    const entry = redoStack.current.pop();
    if (!entry) return null;
    await entry.redo();
    undoStack.current.push(entry);
    return entry;
  }, []);

  const clear = useCallback(() => {
    undoStack.current = [];
    redoStack.current = [];
  }, []);

  return { push, undo, redo, clear };
}
