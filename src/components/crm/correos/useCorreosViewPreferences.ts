"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type RefObject,
} from "react";
import {
  DEFAULT_CORREO_SNOOZE_CONFIG,
  parseCorreoSnoozeConfig,
  type CorreoSnoozeConfig,
} from "@/modules/crm/email/correo-snooze-presets";
import { READER_KEYBOARD_STEP, useReaderResize } from "./useReaderResize";

export type { CorreoSnoozeConfig };
export { DEFAULT_CORREO_SNOOZE_CONFIG };

export type CorreoPreviewLines = 1 | 2 | 3;
/** Segundos que permanece el snackbar Deshacer tras una acción de correo. */
export type CorreoUndoSeconds = 5 | 10 | 15 | 30;
export const DEFAULT_CORREO_UNDO_SECONDS: CorreoUndoSeconds = 10;
export const CORREO_UNDO_SECONDS_OPTIONS: readonly CorreoUndoSeconds[] = [5, 10, 15, 30];

/** Acciones asignables a los gestos de deslizar (todas existen en CorreoAction). */
export type CorreoSwipeAction = "archive" | "trash" | "snooze" | "read" | "star" | "reply";
export type CorreoSwipeConfig = {
  right: [CorreoSwipeAction, CorreoSwipeAction];
  left: [CorreoSwipeAction, CorreoSwipeAction];
};

const SWIPE_ACTIONS: readonly CorreoSwipeAction[] = [
  "archive", "trash", "snooze", "read", "star", "reply",
];

export const DEFAULT_CORREO_SWIPE_CONFIG: CorreoSwipeConfig = {
  right: ["archive", "snooze"],
  left: ["trash", "read"],
};

function parseSwipePair(
  value: unknown,
): [CorreoSwipeAction, CorreoSwipeAction] | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const [first, second] = value as unknown[];
  if (
    !(SWIPE_ACTIONS as readonly unknown[]).includes(first) ||
    !(SWIPE_ACTIONS as readonly unknown[]).includes(second)
  ) {
    return null;
  }
  return [first as CorreoSwipeAction, second as CorreoSwipeAction];
}

/** Config completa o nada: un lado inválido descarta el par guardado. */
function parseSwipeConfig(value: unknown): CorreoSwipeConfig | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const right = parseSwipePair(candidate.right);
  const left = parseSwipePair(candidate.left);
  if (!right || !left) return null;
  return { right, left };
}

/** Acciones con atajo de teclado configurable (estilo Gmail). */
export type CorreoShortcutAction =
  | "down"
  | "up"
  | "open"
  | "toggleSelect"
  | "archive"
  | "trash"
  | "reply"
  | "replyAll"
  | "forward"
  | "replyAi"
  | "star"
  | "snooze"
  | "toggleRead"
  | "focusSearch"
  | "aiMenu";
export type CorreoShortcuts = Record<CorreoShortcutAction, string>;

const SHORTCUT_ACTIONS: readonly CorreoShortcutAction[] = [
  "down", "up", "open", "toggleSelect", "archive", "trash",
  "reply", "replyAll", "forward", "replyAi",
  "star", "snooze", "toggleRead", "focusSearch", "aiMenu",
];

/** Defaults estilo Gmail (s = destacar, b = posponer; a/f/i = lector; . = Acciones IA). */
export const DEFAULT_CORREO_SHORTCUTS: CorreoShortcuts = {
  down: "j",
  up: "k",
  open: "Enter",
  toggleSelect: "x",
  archive: "e",
  trash: "#",
  reply: "r",
  replyAll: "a",
  forward: "f",
  replyAi: "i",
  star: "s",
  snooze: "b",
  toggleRead: "u",
  focusSearch: "/",
  aiMenu: ".",
};

/** Atajos del composer/lector (prioridad ante colisiones con bandeja). */
export const COMPOSE_SHORTCUT_ACTIONS: readonly CorreoShortcutAction[] = [
  "reply",
  "replyAll",
  "forward",
  "replyAi",
];

/** Normaliza teclas grabadas/comparadas: letras en minúscula; especiales intactos. */
export function normalizeShortcutKey(key: string): string {
  if (key.length === 1 && /[a-zA-Z]/.test(key)) return key.toLowerCase();
  return key;
}

/** Resuelve el input de búsqueda activo (desktop toolbar o isla móvil). */
export function focusCorreosSearch(): void {
  const desktop = document.getElementById("correos-search-input");
  if (desktop) {
    desktop.focus();
    return;
  }
  const mobile = document.getElementById("correos-search-input-mobile");
  if (mobile) {
    mobile.focus();
    return;
  }
  // Isla: abrir modo búsqueda del módulo y enfocar el campo.
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("opai:island-open-search"));
  }
}

function firstFreeShortcutKey(config: CorreoShortcuts, preferred: string): string {
  const taken = new Set(Object.values(config));
  if (!taken.has(preferred)) return preferred;
  for (const ch of "abcdefghijklmnopqrstuvwxyz") {
    if (!taken.has(ch)) return ch;
  }
  return preferred;
}

/** Asigna un atajo y libera duplicados (restaura default en la otra acción). */
export function assignCorreoShortcut(
  config: CorreoShortcuts,
  action: CorreoShortcutAction,
  key: string,
): CorreoShortcuts {
  const normalized = normalizeShortcutKey(key);
  const next: CorreoShortcuts = { ...config, [action]: normalized };
  for (const other of SHORTCUT_ACTIONS) {
    if (other !== action && next[other] === normalized) {
      // Quitar temporalmente para buscar tecla libre.
      const without = { ...next, [other]: "\0" };
      next[other] = firstFreeShortcutKey(without, DEFAULT_CORREO_SHORTCUTS[other]);
    }
  }
  return next;
}

/** Merge de lo guardado sobre los defaults: solo teclas string no vacías para
 *  acciones conocidas; el resto conserva el default (nunca deja una acción sin
 *  atajo). */
function parseShortcuts(value: unknown): CorreoShortcuts | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const merged: CorreoShortcuts = { ...DEFAULT_CORREO_SHORTCUTS };
  const touched = new Set<CorreoShortcutAction>();
  for (const action of SHORTCUT_ACTIONS) {
    const key = candidate[action];
    if (typeof key === "string" && key.length > 0 && key.length <= 12) {
      merged[action] = normalizeShortcutKey(key);
      touched.add(action);
    }
  }
  if (touched.size === 0) return null;

  // Preferir teclas guardadas; reasignar defaults que colisionen.
  const claimed = new Set<string>();
  for (const action of SHORTCUT_ACTIONS) {
    if (touched.has(action)) claimed.add(merged[action]);
  }
  for (const action of SHORTCUT_ACTIONS) {
    if (touched.has(action)) continue;
    if (claimed.has(merged[action])) {
      const without = { ...merged, [action]: "\0" };
      merged[action] = firstFreeShortcutKey(without, DEFAULT_CORREO_SHORTCUTS[action]);
    }
    claimed.add(merged[action]);
  }
  return merged;
}

const STORAGE_KEY = "opai.crm.correos.view.v1";
const DEFAULT_RATIO = 0.46;
export const MIN_PANEL_WIDTH = 420;
/** Mínimo real de la columna de lista en split (no ratio ciego). */
export const LIST_MIN_WIDTH = 340;
export const RAIL_COLLAPSED = 68;
export const RAIL_EXPANDED = 224;
/** Gap entre riel / lista / lector (`lg:gap-3` = 12px × 2). */
export const WORKSPACE_GAP = 12;
/** Histéresis split ↔ contained para evitar parpadeo al redimensionar. */
const MODE_HYSTERESIS_PX = 24;
const KEYBOARD_STEP = READER_KEYBOARD_STEP;

export type CorreoDesktopReaderMode = "split" | "contained";

export function correoReaderBudget(
  workspaceWidth: number,
  railCollapsed: boolean,
): { available: number; maxReader: number; canSplit: boolean } {
  const rail = railCollapsed ? RAIL_COLLAPSED : RAIL_EXPANDED;
  const available = workspaceWidth - rail - WORKSPACE_GAP * 2;
  const maxReader = available - LIST_MIN_WIDTH;
  return { available, maxReader, canSplit: maxReader >= MIN_PANEL_WIDTH };
}

type StoredPreferences = {
  panelWidth?: number;
  previewLines?: CorreoPreviewLines;
  swipeConfig?: CorreoSwipeConfig;
  /** Riel de carpetas desktop contraído (estilo Gmail, persistente). */
  railCollapsed?: boolean;
  /** Atajos de teclado configurables (acción → tecla). */
  shortcuts?: CorreoShortcuts;
  /** Cargar imágenes remotas de los correos sin pedir confirmación. */
  alwaysShowImages?: boolean;
  /** Ventana visible del snackbar Deshacer (acciones de bandeja). */
  undoSeconds?: CorreoUndoSeconds;
  /** Horas/días de los presets de posponer (estilo Gmail). */
  snoozeConfig?: CorreoSnoozeConfig;
};

export function parseCorreosViewPreferences(
  raw: string | null,
): StoredPreferences {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const candidate = parsed as Record<string, unknown>;
    const preferences: StoredPreferences = {};
    if (
      typeof candidate.panelWidth === "number" &&
      Number.isFinite(candidate.panelWidth)
    ) {
      preferences.panelWidth = candidate.panelWidth;
    }
    if (
      candidate.previewLines === 1 ||
      candidate.previewLines === 2 ||
      candidate.previewLines === 3
    ) {
      preferences.previewLines = candidate.previewLines;
    }
    const swipeConfig = parseSwipeConfig(candidate.swipeConfig);
    if (swipeConfig) {
      preferences.swipeConfig = swipeConfig;
    }
    if (typeof candidate.railCollapsed === "boolean") {
      preferences.railCollapsed = candidate.railCollapsed;
    }
    const shortcuts = parseShortcuts(candidate.shortcuts);
    if (shortcuts) {
      preferences.shortcuts = shortcuts;
    }
    if (typeof candidate.alwaysShowImages === "boolean") {
      preferences.alwaysShowImages = candidate.alwaysShowImages;
    }
    if (
      candidate.undoSeconds === 5 ||
      candidate.undoSeconds === 10 ||
      candidate.undoSeconds === 15 ||
      candidate.undoSeconds === 30
    ) {
      preferences.undoSeconds = candidate.undoSeconds;
    }
    if (candidate.snoozeConfig !== undefined) {
      preferences.snoozeConfig = parseCorreoSnoozeConfig(candidate.snoozeConfig);
    }
    return preferences;
  } catch {
    return {};
  }
}

/**
 * Clampa el ancho del lector reservando LIST_MIN_WIDTH para la lista.
 * Con `workspaceWidth <= 0` (SSR / primer paint) no clampea: devuelve el
 * valor preferido redondeado.
 */
export function clampCorreoPanelWidth(
  width: number,
  workspaceWidth: number,
  railCollapsed = true,
): number {
  if (workspaceWidth <= 0) return Math.round(width);
  const { maxReader } = correoReaderBudget(workspaceWidth, railCollapsed);
  const upper = Math.max(MIN_PANEL_WIDTH, maxReader);
  return Math.round(Math.min(Math.max(width, MIN_PANEL_WIDTH), upper));
}

function defaultWidth(containerWidth: number, railCollapsed = true): number {
  return clampCorreoPanelWidth(
    Math.round(containerWidth * DEFAULT_RATIO),
    containerWidth,
    railCollapsed,
  );
}

export function useCorreosViewPreferences(
  containerRef: RefObject<HTMLElement | null>,
) {
  /** Ancho elegido por el usuario (persistido). El ancho visible se clampéa al
   *  workspace actual sin sobrescribir la preferencia guardada. */
  const [preferredPanelWidth, setPreferredPanelWidth] = useState(560);
  const [workspaceWidth, setWorkspaceWidth] = useState(0);
  const [previewLines, setPreviewLines] = useState<CorreoPreviewLines>(2);
  const [swipeConfig, setSwipeConfig] = useState<CorreoSwipeConfig>(
    DEFAULT_CORREO_SWIPE_CONFIG,
  );
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [shortcuts, setShortcuts] = useState<CorreoShortcuts>(
    DEFAULT_CORREO_SHORTCUTS,
  );
  const [alwaysShowImages, setAlwaysShowImages] = useState(false);
  const [undoSeconds, setUndoSeconds] = useState<CorreoUndoSeconds>(
    DEFAULT_CORREO_UNDO_SECONDS,
  );
  const [snoozeConfig, setSnoozeConfig] = useState<CorreoSnoozeConfig>(
    DEFAULT_CORREO_SNOOZE_CONFIG,
  );
  const [hydrated, setHydrated] = useState(false);

  const containerWidth = useCallback(() => {
    const measured = containerRef.current?.getBoundingClientRect().width;
    if (measured && measured > 0) return measured;
    // SSR / primer paint sin layout: no tocar window (rompe /crm/correos).
    if (typeof window === "undefined") return 1280;
    return window.innerWidth;
  }, [containerRef]);

  const panelWidth = useMemo(() => {
    const basis = workspaceWidth > 0 ? workspaceWidth : containerWidth();
    return clampCorreoPanelWidth(preferredPanelWidth, basis, railCollapsed);
  }, [preferredPanelWidth, workspaceWidth, containerWidth, railCollapsed]);

  /** Modo del lector desktop: split si hay presupuesto; contained si no.
   *  Histéresis de 24 px sobre el umbral para evitar parpadeo. */
  const [desktopReaderMode, setDesktopReaderMode] =
    useState<CorreoDesktopReaderMode>("split");

  useEffect(() => {
    const basis = workspaceWidth > 0 ? workspaceWidth : 0;
    if (basis <= 0) {
      setDesktopReaderMode("split");
      return;
    }
    const { maxReader } = correoReaderBudget(basis, railCollapsed);
    setDesktopReaderMode((prev) => {
      if (prev === "split") {
        return maxReader < MIN_PANEL_WIDTH ? "contained" : "split";
      }
      return maxReader >= MIN_PANEL_WIDTH + MODE_HYSTERESIS_PX
        ? "split"
        : "contained";
    });
  }, [workspaceWidth, railCollapsed]);

  useEffect(() => {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch {
      // Storage deshabilitado: usar defaults.
    }
    const stored = parseCorreosViewPreferences(raw);
    const width = containerWidth();
    setWorkspaceWidth(width);
    const initialRail =
      typeof stored.railCollapsed === "boolean" ? stored.railCollapsed : false;
    setPreferredPanelWidth(
      typeof stored.panelWidth === "number"
        ? stored.panelWidth
        : defaultWidth(width, initialRail),
    );
    if (
      stored.previewLines === 1 ||
      stored.previewLines === 2 ||
      stored.previewLines === 3
    ) {
      setPreviewLines(stored.previewLines);
    }
    if (stored.swipeConfig) {
      setSwipeConfig(stored.swipeConfig);
    }
    if (typeof stored.railCollapsed === "boolean") {
      setRailCollapsed(stored.railCollapsed);
    }
    if (stored.shortcuts) {
      setShortcuts(stored.shortcuts);
    }
    if (typeof stored.alwaysShowImages === "boolean") {
      setAlwaysShowImages(stored.alwaysShowImages);
    }
    if (stored.undoSeconds) {
      setUndoSeconds(stored.undoSeconds);
    }
    if (stored.snoozeConfig) {
      setSnoozeConfig(stored.snoozeConfig);
    }
    setHydrated(true);
  }, [containerWidth]);

  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            panelWidth: preferredPanelWidth, previewLines, swipeConfig, railCollapsed,
            shortcuts, alwaysShowImages, undoSeconds, snoozeConfig,
          }),
        );
      } catch {
        // Safari/private mode puede bloquear storage: la vista sigue operativa.
      }
    }, 120);
    return () => window.clearTimeout(timer);
  }, [hydrated, preferredPanelWidth, previewLines, swipeConfig, railCollapsed, shortcuts, alwaysShowImages, undoSeconds, snoozeConfig]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry?.contentRect.width;
      if (!width) return;
      setWorkspaceWidth(width);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [containerRef]);

  const resetPanelWidth = useCallback(() => {
    setPreferredPanelWidth(defaultWidth(containerWidth(), railCollapsed));
  }, [containerWidth, railCollapsed]);

  const clampPreferred = useCallback(
    (next: number) => clampCorreoPanelWidth(next, containerWidth(), railCollapsed),
    [containerWidth, railCollapsed],
  );

  const { onResizePointerDown, onResizeKeyDown } = useReaderResize({
    width: panelWidth,
    setWidth: setPreferredPanelWidth,
    clamp: clampPreferred,
    onReset: resetPanelWidth,
    step: KEYBOARD_STEP,
  });

  return {
    panelWidth,
    workspaceWidth,
    desktopReaderMode,
    previewLines,
    setPreviewLines,
    swipeConfig,
    setSwipeConfig,
    railCollapsed,
    setRailCollapsed,
    shortcuts,
    setShortcuts,
    alwaysShowImages,
    setAlwaysShowImages,
    undoSeconds,
    setUndoSeconds,
    snoozeConfig,
    setSnoozeConfig,
    resetPanelWidth,
    onResizePointerDown,
    onResizeKeyDown,
  };
}
