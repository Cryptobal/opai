"use client";

/**
 * Motor de layout del workspace Correos desktop.
 * Mide solo `[data-correo-scope]` (ancho ya reducido por el padding del dock)
 * y deriva listWidth / listMode / tiers aritméticamente — sin leer columnas
 * calculadas (evita bucles de ResizeObserver).
 */

import { useEffect, useMemo, useState, type RefObject } from "react";
import {
  MIN_PANEL_WIDTH,
  RAIL_COLLAPSED,
  RAIL_EXPANDED,
  WORKSPACE_GAP,
} from "./useCorreosViewPreferences";
import { CORREO_DOCK_WIDTH } from "./correo-copilot-dock";

export const LIST_READABLE_MIN = 380;
export const LIST_MINI_WIDTH = 72;
export const READER_MIN_WIDTH = MIN_PANEL_WIDTH; // 420
export const DOCK_WIDTH = CORREO_DOCK_WIDTH; // 430

export type CorreoListMode = "full" | "mini";
export type CorreoToolbarTier = "wide" | "mid" | "narrow";
export type CorreoRowMode = "default" | "narrow";

export type CorreoWorkspaceLayout = {
  listWidth: number | null;
  listMode: CorreoListMode;
  tier: CorreoToolbarTier;
  rowMode: CorreoRowMode;
  /** Ancho efectivo de columna de lista usado para tiers (mini → narrow). */
  listColumnWidth: number;
  /** Ancho sugerido del lector cuando el motor reasignó espacio; null = usar preferencia. */
  readerWidth: number | null;
};

type Args = {
  containerRef: RefObject<HTMLElement | null>;
  railCollapsed: boolean;
  readerOpen: boolean;
  dockOpen: boolean;
  panelWidth: number;
};

function tierFromWidth(w: number): CorreoToolbarTier {
  if (w >= 700) return "wide";
  if (w >= 520) return "mid";
  return "narrow";
}

function computeLayout(
  scopeWidth: number,
  railCollapsed: boolean,
  readerOpen: boolean,
  dockOpen: boolean,
  panelWidth: number,
): CorreoWorkspaceLayout {
  if (scopeWidth <= 0) {
    return {
      listWidth: null,
      listMode: "full",
      tier: "wide",
      rowMode: "default",
      listColumnWidth: LIST_READABLE_MIN,
      readerWidth: null,
    };
  }

  // El contenedor ya aplica paddingRight del dock; no restar el dock otra vez.
  const rail = railCollapsed ? RAIL_COLLAPSED : RAIL_EXPANDED;
  const gaps = WORKSPACE_GAP * (readerOpen ? 2 : 1);
  const available = Math.max(0, scopeWidth - rail - gaps);

  if (!readerOpen) {
    const listColumnWidth = available;
    return {
      listWidth: null,
      listMode: "full",
      tier: tierFromWidth(listColumnWidth),
      rowMode: listColumnWidth < 560 ? "narrow" : "default",
      listColumnWidth,
      readerWidth: null,
    };
  }

  const desiredReader = Math.max(READER_MIN_WIDTH, panelWidth);
  // (1) lector cede hasta mínimo
  let reader = Math.min(desiredReader, Math.max(READER_MIN_WIDTH, available - LIST_READABLE_MIN));
  let list = available - reader;

  // (2) lista cede hasta legible
  if (list < LIST_READABLE_MIN) {
    list = LIST_READABLE_MIN;
    reader = available - list;
  }

  // (3) si aún no cabe el lector mínimo → mini-lista
  let listMode: CorreoListMode = "full";
  if (reader < READER_MIN_WIDTH || list + READER_MIN_WIDTH > available) {
    listMode = "mini";
    list = LIST_MINI_WIDTH;
    reader = Math.max(READER_MIN_WIDTH, available - list);
  }

  // Con dock abierto y espacio crítico, forzar mini si el lector quedaría ilegible.
  if (dockOpen && reader < READER_MIN_WIDTH) {
    listMode = "mini";
    list = LIST_MINI_WIDTH;
    reader = Math.max(READER_MIN_WIDTH, available - list);
  }

  const listColumnWidth = listMode === "mini" ? LIST_MINI_WIDTH : list;
  const readerWidth =
    listMode === "mini" || reader < desiredReader ? Math.round(reader) : null;
  return {
    listWidth: listColumnWidth,
    listMode,
    tier: tierFromWidth(listColumnWidth),
    rowMode: listColumnWidth < 560 ? "narrow" : "default",
    listColumnWidth,
    readerWidth,
  };
}

export function useCorreoWorkspaceLayout({
  containerRef,
  railCollapsed,
  readerOpen,
  dockOpen,
  panelWidth,
}: Args): CorreoWorkspaceLayout {
  const [scopeWidth, setScopeWidth] = useState(0);

  useEffect(() => {
    const node = containerRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const obs = new ResizeObserver(([entry]) => {
      const w = entry?.contentRect.width;
      if (typeof w === "number" && w > 0) setScopeWidth(w);
    });
    obs.observe(node);
    setScopeWidth(node.getBoundingClientRect().width);
    return () => obs.disconnect();
  }, [containerRef]);

  return useMemo(
    () =>
      computeLayout(scopeWidth, railCollapsed, readerOpen, dockOpen, panelWidth),
    [scopeWidth, railCollapsed, readerOpen, dockOpen, panelWidth],
  );
}

/** Exportado para tests unitarios del algoritmo. */
export const __correoLayoutForTest = { computeLayout };
