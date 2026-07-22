"use client";

import {
  useCallback,
  useEffect,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from "react";

export type CorreoPreviewLines = 1 | 2 | 3;

const STORAGE_KEY = "opai.crm.correos.view.v1";
const DEFAULT_RATIO = 0.46;
const MIN_PANEL_WIDTH = 420;
const MAX_PANEL_RATIO = 0.72;
const KEYBOARD_STEP = 24;

type StoredPreferences = {
  panelWidth?: number;
  previewLines?: CorreoPreviewLines;
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
    return preferences;
  } catch {
    return {};
  }
}

export function clampCorreoPanelWidth(width: number, containerWidth: number): number {
  const safeContainer = Math.max(containerWidth, MIN_PANEL_WIDTH);
  const max = Math.max(
    MIN_PANEL_WIDTH,
    Math.floor(safeContainer * MAX_PANEL_RATIO),
  );
  return Math.round(Math.min(Math.max(width, MIN_PANEL_WIDTH), max));
}

function defaultWidth(containerWidth: number): number {
  return clampCorreoPanelWidth(
    Math.round(containerWidth * DEFAULT_RATIO),
    containerWidth,
  );
}

export function useCorreosViewPreferences(
  containerRef: RefObject<HTMLElement | null>,
) {
  const [panelWidth, setPanelWidth] = useState(560);
  const [previewLines, setPreviewLines] = useState<CorreoPreviewLines>(2);
  const [hydrated, setHydrated] = useState(false);

  const containerWidth = useCallback(
    () => containerRef.current?.getBoundingClientRect().width ?? window.innerWidth,
    [containerRef],
  );

  useEffect(() => {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch {
      // Storage deshabilitado: usar defaults.
    }
    const stored = parseCorreosViewPreferences(raw);
    const width = containerWidth();
    setPanelWidth(
      clampCorreoPanelWidth(
        typeof stored.panelWidth === "number"
          ? stored.panelWidth
          : defaultWidth(width),
        width,
      ),
    );
    if (
      stored.previewLines === 1 ||
      stored.previewLines === 2 ||
      stored.previewLines === 3
    ) {
      setPreviewLines(stored.previewLines);
    }
    setHydrated(true);
  }, [containerWidth]);

  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ panelWidth, previewLines }),
        );
      } catch {
        // Safari/private mode puede bloquear storage: la vista sigue operativa.
      }
    }, 120);
    return () => window.clearTimeout(timer);
  }, [hydrated, panelWidth, previewLines]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry?.contentRect.width;
      if (!width) return;
      setPanelWidth((current) => clampCorreoPanelWidth(current, width));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [containerRef]);

  const resetPanelWidth = useCallback(() => {
    setPanelWidth(defaultWidth(containerWidth()));
  }, [containerWidth]);

  const onResizePointerDown = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      const startX = event.clientX;
      const startWidth = panelWidth;
      const priorCursor = document.body.style.cursor;
      const priorSelect = document.body.style.userSelect;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const move = (moveEvent: globalThis.PointerEvent) => {
        const next = startWidth + startX - moveEvent.clientX;
        setPanelWidth(clampCorreoPanelWidth(next, containerWidth()));
      };
      const stop = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", stop);
        window.removeEventListener("pointercancel", stop);
        document.body.style.cursor = priorCursor;
        document.body.style.userSelect = priorSelect;
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", stop, { once: true });
      window.addEventListener("pointercancel", stop, { once: true });
    },
    [containerWidth, panelWidth],
  );

  const onResizeKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setPanelWidth((width) =>
          clampCorreoPanelWidth(width + KEYBOARD_STEP, containerWidth()),
        );
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setPanelWidth((width) =>
          clampCorreoPanelWidth(width - KEYBOARD_STEP, containerWidth()),
        );
      } else if (event.key === "Home") {
        event.preventDefault();
        resetPanelWidth();
      }
    },
    [containerWidth, resetPanelWidth],
  );

  return {
    panelWidth,
    previewLines,
    setPreviewLines,
    resetPanelWidth,
    onResizePointerDown,
    onResizeKeyDown,
  };
}
