"use client";

import { animate, useMotionValue } from "framer-motion";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import {
  isSwipeArmed,
  resolveSwipeRelease,
  shouldHapticSnapOpen,
  SWIPE_OPEN_WIDTH,
  SWIPE_SNAP_SPRING,
  toVisualDx,
  type CorreoSwipeSide,
} from "./row-swipe-gesture";

export type { CorreoSwipeSide } from "./row-swipe-gesture";
export { SWIPE_LONG_RATIO, SWIPE_OPEN_WIDTH } from "./row-swipe-gesture";

const AXIS_LOCK = 6;
const LONG_PRESS_MS = 450;
const LONG_PRESS_MOVE = 10;

function hapticLight() {
  try {
    navigator.vibrate?.(8);
  } catch {
    // no-op
  }
}

function hapticArmed() {
  try {
    navigator.vibrate?.([12, 8, 12]);
  } catch {
    // no-op
  }
}

function hapticLongPress() {
  try {
    navigator.vibrate?.(10);
  } catch {
    // no-op
  }
}

/**
 * Máquina de gestos del swipe de dos niveles con motion values (sin re-render
 * por frame), spring al soltar, flick por velocidad y háptica diferenciada.
 */
export function useRowSwipe(opts: {
  enabled: boolean;
  onLongSwipe: (side: CorreoSwipeSide) => void;
  onButtonSwipe?: (side: CorreoSwipeSide, buttonIndex: 0 | 1) => void;
  onLongPress?: () => void;
}) {
  const { enabled, onLongSwipe, onButtonSwipe, onLongPress } = opts;
  const x = useMotionValue(0);
  const [openSide, setOpenSide] = useState<CorreoSwipeSide | null>(null);
  const [dragging, setDragging] = useState(false);
  const [dragSide, setDragSide] = useState<CorreoSwipeSide | null>(null);

  const armedRef = useRef(false);
  const snapHapticRef = useRef(false);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const start = useRef({ x: 0, y: 0, base: 0 });
  const lastMove = useRef({ x: 0, t: 0 });
  const axis = useRef<"h" | "v" | null>(null);
  const rawDxRef = useRef(0);
  const velocityRef = useRef(0);
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

  const resetFeedback = useCallback(() => {
    armedRef.current = false;
    snapHapticRef.current = false;
  }, []);

  const animateTo = useCallback(
    (target: number, rawTarget = target) => {
      rawDxRef.current = rawTarget;
      void animate(x, target, SWIPE_SNAP_SPRING);
    },
    [x],
  );

  const close = useCallback(() => {
    setOpenSide(null);
    rawDxRef.current = 0;
    resetFeedback();
    animateTo(0, 0);
  }, [animateTo, resetFeedback]);

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
      base:
        openSide === "right"
          ? SWIPE_OPEN_WIDTH
          : openSide === "left"
            ? -SWIPE_OPEN_WIDTH
            : 0,
    };
    lastMove.current = { x: event.clientX, t: event.timeStamp };
    velocityRef.current = 0;
    axis.current = null;
    suppressClick.current = false;
    longPressed.current = false;
    snapHapticRef.current = false;
    if (onLongPress) {
      clearLongPress();
      longPressTimer.current = window.setTimeout(() => {
        longPressTimer.current = null;
        longPressed.current = true;
        suppressClick.current = true;
        hapticLongPress();
        onLongPress();
      }, LONG_PRESS_MS);
    }
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const rawDx = event.clientX - start.current.x;
    const rawDy = event.clientY - start.current.y;
    const dt = Math.max(event.timeStamp - lastMove.current.t, 1);
    velocityRef.current = ((event.clientX - lastMove.current.x) / dt) * 1000;
    lastMove.current = { x: event.clientX, t: event.timeStamp };

    if (
      longPressTimer.current != null &&
      (Math.abs(rawDx) > LONG_PRESS_MOVE || Math.abs(rawDy) > LONG_PRESS_MOVE)
    ) {
      clearLongPress();
    }
    if (longPressed.current) return;
    if (!enabled) return;

    if (axis.current === null) {
      if (Math.abs(rawDx) < AXIS_LOCK && Math.abs(rawDy) < AXIS_LOCK) return;
      axis.current = Math.abs(rawDx) > Math.abs(rawDy) ? "h" : "v";
      if (axis.current === "h") {
        clearLongPress();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        setDragging(true);
        const initial = start.current.base + rawDx;
        setDragSide(initial >= 0 ? "right" : "left");
      }
    }
    if (axis.current !== "h") return;

    const width = rowRef.current?.offsetWidth ?? 360;
    const next = Math.max(Math.min(start.current.base + rawDx, width), -width);
    rawDxRef.current = next;
    x.set(toVisualDx(next));

    const absRaw = Math.abs(next);
    const nowArmed = isSwipeArmed(absRaw, width);
    if (nowArmed !== armedRef.current) {
      armedRef.current = nowArmed;
      if (nowArmed) hapticArmed();
    }

    if (!snapHapticRef.current && shouldHapticSnapOpen(absRaw)) {
      snapHapticRef.current = true;
      hapticLight();
    }
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
    setDragSide(null);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    suppressClick.current = true;

    const width = rowRef.current?.offsetWidth ?? 360;
    const outcome = resolveSwipeRelease({
      value: rawDxRef.current,
      rowWidth: width,
      velocityX: velocityRef.current,
    });

    if (outcome.type === "long") {
      setOpenSide(null);
      rawDxRef.current = 0;
      resetFeedback();
      animateTo(0, 0);
      onLongSwipe(outcome.side);
      return;
    }

    if (outcome.type === "button") {
      setOpenSide(null);
      rawDxRef.current = 0;
      resetFeedback();
      animateTo(0, 0);
      onButtonSwipe?.(outcome.side, outcome.buttonIndex);
      return;
    }

    if (outcome.type === "snap") {
      setOpenSide(outcome.side);
      const target =
        outcome.side === "right" ? SWIPE_OPEN_WIDTH : -SWIPE_OPEN_WIDTH;
      rawDxRef.current = target;
      resetFeedback();
      animateTo(target, target);
      if (!snapHapticRef.current) hapticLight();
      return;
    }

    close();
  }

  const wasDragged = useCallback(() => {
    const value = suppressClick.current;
    suppressClick.current = false;
    return value;
  }, []);

  return {
    x,
    openSide,
    dragging,
    dragSide,
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
