"use client";

import { useCallback, useRef } from "react";
import { triggerHaptic } from "@/lib/haptics";

const DEFAULT_MS = 380;
const MOVE_THRESHOLD_PX = 8;

/**
 * Long-press por pointer events: dispara `onLongPress` tras ~380 ms.
 * Cancela si hay scroll/move > 8px o se suelta antes. Háptica medium si Capacitor.
 */
export function useLongPress(
  onLongPress: (e: React.PointerEvent) => void,
  opts?: { ms?: number; disabled?: boolean },
) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const ms = opts?.ms ?? DEFAULT_MS;
  const disabled = opts?.disabled === true;

  const clear = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    start.current = null;
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled || e.button !== 0) return;
      // Solo touch/pen: en mouse el menú es contextmenu.
      if (e.pointerType === "mouse") return;
      fired.current = false;
      start.current = { x: e.clientX, y: e.clientY };
      timer.current = setTimeout(() => {
        fired.current = true;
        void triggerHaptic("medium");
        onLongPress(e);
        timer.current = null;
      }, ms);
    },
    [disabled, ms, onLongPress],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!start.current || !timer.current) return;
      const dx = e.clientX - start.current.x;
      const dy = e.clientY - start.current.y;
      if (dx * dx + dy * dy > MOVE_THRESHOLD_PX * MOVE_THRESHOLD_PX) clear();
    },
    [clear],
  );

  const onPointerUp = useCallback(() => {
    clear();
  }, [clear]);

  const onPointerCancel = useCallback(() => {
    clear();
  }, [clear]);

  /** true si el long-press ya disparó (para anular el click siguiente). */
  const didFire = useCallback(() => fired.current, []);

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    didFire,
  };
}
