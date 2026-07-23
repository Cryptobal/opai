"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";

export type CorreoSwipeSide = "right" | "left";

/** 2 botones de 74px por lado (estilo Apple Mail). */
export const SWIPE_OPEN_WIDTH = 148;
/** Bajo este desplazamiento el gesto se considera tap/ruido y cierra. */
const MIN_COMMIT = 36;
/** Proporción del ancho de fila que dispara la acción principal del lado. */
export const SWIPE_LONG_RATIO = 0.55;
/** Píxeles antes de decidir si el gesto es horizontal o scroll vertical. */
const AXIS_LOCK = 8;
/** Long-press: umbral de disparo y tolerancia de movimiento (estilo Gmail). */
const LONG_PRESS_MS = 450;
const LONG_PRESS_MOVE = 10;

/**
 * Máquina de gestos del swipe de dos niveles: arrastre con pointer events
 * (capture + touch-action pan-y en el consumidor), lock de eje para no pelear
 * con el scroll, estado "abierto" con botones revelados y swipe largo que
 * dispara la acción principal. El componente decide qué ejecutar.
 */
export function useRowSwipe(opts: {
  enabled: boolean;
  onLongSwipe: (side: CorreoSwipeSide) => void;
  /** Long-press (~450ms sin arrastre) → modo selección. Sigue activo aunque
   *  el swipe esté deshabilitado (p. ej. durante la selección). */
  onLongPress?: () => void;
}) {
  const { enabled, onLongSwipe, onLongPress } = opts;
  const [dx, setDx] = useState(0);
  const [openSide, setOpenSide] = useState<CorreoSwipeSide | null>(null);
  const [dragging, setDragging] = useState(false);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const start = useRef({ x: 0, y: 0, base: 0 });
  const axis = useRef<"h" | "v" | null>(null);
  const dxRef = useRef(0);
  const suppressClick = useRef(false);
  const longPressTimer = useRef<number | null>(null);
  const longPressed = useRef(false);

  const clearLongPress = useCallback(() => {
    if (longPressTimer.current != null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  useEffect(() => clearLongPress, [clearLongPress]);

  const close = useCallback(() => {
    setOpenSide(null);
    dxRef.current = 0;
    setDx(0);
  }, []);

  // Tap o arrastre fuera de la fila (p. ej. otra fila) cierra los botones.
  useEffect(() => {
    if (!openSide) return;
    const onDocDown = (event: globalThis.PointerEvent) => {
      const node = rowRef.current;
      if (node && event.target instanceof Node && !node.contains(event.target)) {
        close();
      }
    };
    document.addEventListener("pointerdown", onDocDown);
    return () => document.removeEventListener("pointerdown", onDocDown);
  }, [openSide, close]);

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!enabled && !onLongPress) return;
    start.current = {
      x: event.clientX,
      y: event.clientY,
      base: openSide === "right" ? SWIPE_OPEN_WIDTH : openSide === "left" ? -SWIPE_OPEN_WIDTH : 0,
    };
    axis.current = null;
    suppressClick.current = false;
    longPressed.current = false;
    if (onLongPress) {
      clearLongPress();
      longPressTimer.current = window.setTimeout(() => {
        longPressTimer.current = null;
        longPressed.current = true;
        // El click fantasma tras soltar no debe abrir/alternar de nuevo.
        suppressClick.current = true;
        navigator.vibrate?.(10);
        onLongPress();
      }, LONG_PRESS_MS);
    }
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const rawDx = event.clientX - start.current.x;
    const rawDy = event.clientY - start.current.y;
    // Moverse cancela el long-press (es scroll o swipe, no una pulsación).
    if (
      longPressTimer.current != null &&
      (Math.abs(rawDx) > LONG_PRESS_MOVE || Math.abs(rawDy) > LONG_PRESS_MOVE)
    ) {
      clearLongPress();
    }
    // Tras dispararse el long-press, el resto del arrastre se ignora.
    if (longPressed.current) return;
    if (!enabled) return;
    if (axis.current === null) {
      if (Math.abs(rawDx) < AXIS_LOCK && Math.abs(rawDy) < AXIS_LOCK) return;
      axis.current = Math.abs(rawDx) > Math.abs(rawDy) ? "h" : "v";
      if (axis.current === "h") {
        clearLongPress();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        setDragging(true);
      }
    }
    if (axis.current !== "h") return;
    const width = rowRef.current?.offsetWidth ?? 360;
    const next = Math.max(Math.min(start.current.base + rawDx, width), -width);
    dxRef.current = next;
    setDx(next);
  }

  function onPointerEnd(event: PointerEvent<HTMLDivElement>) {
    clearLongPress();
    if (longPressed.current) {
      longPressed.current = false;
      axis.current = null;
      return;
    }
    const wasHorizontal = axis.current === "h";
    axis.current = null;
    if (!wasHorizontal) return;
    setDragging(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    // El click fantasma posterior al gesto no debe abrir el hilo.
    suppressClick.current = true;
    const width = rowRef.current?.offsetWidth ?? 360;
    const value = dxRef.current;
    const side: CorreoSwipeSide = value > 0 ? "right" : "left";
    if (Math.abs(value) > width * SWIPE_LONG_RATIO) {
      setOpenSide(null);
      dxRef.current = 0;
      setDx(0);
      onLongSwipe(side);
    } else if (Math.abs(value) >= MIN_COMMIT) {
      setOpenSide(side);
      const target = side === "right" ? SWIPE_OPEN_WIDTH : -SWIPE_OPEN_WIDTH;
      dxRef.current = target;
      setDx(target);
    } else {
      close();
    }
  }

  /** Consume la supresión del click posterior a un arrastre (una sola vez). */
  const wasDragged = useCallback(() => {
    const value = suppressClick.current;
    suppressClick.current = false;
    return value;
  }, []);

  return {
    dx,
    openSide,
    dragging,
    rowRef,
    close,
    wasDragged,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: onPointerEnd,
      onPointerCancel: onPointerEnd,
    },
  };
}
