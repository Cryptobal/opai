"use client";

import { useCallback, useEffect, useState } from "react";
import type { TicketPriority, TicketStatus } from "@/lib/tickets";

/**
 * Estado serializable de los filtros de la lista de tickets.
 * Es lo que persiste una vista guardada — NO incluye listMode ni
 * paginación: son preferencias visuales, no parte del filtro.
 */
export interface TicketViewState {
  filterStatus: "all" | "active" | TicketStatus;
  filterPriorities: TicketPriority[];
  originTab: "all" | "internal" | "guard" | "client";
  filterTypeId: string; // "all" o un id de OpsTicketType
  assignedFilter: "any" | "me" | "unassigned";
  slaOnly: boolean;
  search: string;
}

export interface SavedTicketView {
  id: string;
  name: string;
  state: TicketViewState;
  createdAt: number;
}

const STORAGE_KEY = "opai.tickets.savedViews.v1";
const MAX_VIEWS = 12;

function readStorage(): SavedTicketView[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidSavedView);
  } catch {
    return [];
  }
}

function writeStorage(views: SavedTicketView[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(views));
  } catch {
    // QuotaExceeded o privacidad — silencioso, la feature es no-crítica.
  }
}

function isValidSavedView(v: unknown): v is SavedTicketView {
  if (!v || typeof v !== "object") return false;
  const x = v as Record<string, unknown>;
  return (
    typeof x.id === "string" &&
    typeof x.name === "string" &&
    typeof x.createdAt === "number" &&
    !!x.state &&
    typeof x.state === "object"
  );
}

/**
 * Compara dos estados de vista por igualdad estructural. Sirve para detectar
 * cuál vista guardada está activa.
 */
export function viewStatesEqual(
  a: TicketViewState,
  b: TicketViewState,
): boolean {
  if (a.filterStatus !== b.filterStatus) return false;
  if (a.originTab !== b.originTab) return false;
  if (a.filterTypeId !== b.filterTypeId) return false;
  if (a.assignedFilter !== b.assignedFilter) return false;
  if (a.slaOnly !== b.slaOnly) return false;
  if ((a.search ?? "") !== (b.search ?? "")) return false;
  const aP = [...a.filterPriorities].sort();
  const bP = [...b.filterPriorities].sort();
  if (aP.length !== bP.length) return false;
  for (let i = 0; i < aP.length; i++) if (aP[i] !== bP[i]) return false;
  return true;
}

export function useTicketSavedViews() {
  const [views, setViews] = useState<SavedTicketView[]>([]);

  // Hidratar desde localStorage al montar (no en SSR).
  useEffect(() => {
    setViews(readStorage());
  }, []);

  const save = useCallback(
    (name: string, state: TicketViewState): SavedTicketView | null => {
      const trimmed = name.trim();
      if (!trimmed) return null;
      const newView: SavedTicketView = {
        id:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `v_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: trimmed.slice(0, 60),
        state,
        createdAt: Date.now(),
      };
      setViews((prev) => {
        // Reemplaza si ya existe una vista con el mismo nombre (case insensitive).
        const filtered = prev.filter(
          (v) => v.name.toLowerCase() !== trimmed.toLowerCase(),
        );
        const next = [newView, ...filtered].slice(0, MAX_VIEWS);
        writeStorage(next);
        return next;
      });
      return newView;
    },
    [],
  );

  const remove = useCallback((id: string) => {
    setViews((prev) => {
      const next = prev.filter((v) => v.id !== id);
      writeStorage(next);
      return next;
    });
  }, []);

  const rename = useCallback((id: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setViews((prev) => {
      const next = prev.map((v) =>
        v.id === id ? { ...v, name: trimmed.slice(0, 60) } : v,
      );
      writeStorage(next);
      return next;
    });
  }, []);

  return { views, save, remove, rename };
}
