"use client";

import {
  animate,
  useMotionValue,
  type PanInfo,
} from "framer-motion";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { triggerHaptic } from "@/lib/haptics";
import { lockSwipeScroll, unlockSwipeScroll } from "@/lib/swipe-scroll-lock";
import {
  isSwipeArmed,
  isSwipeOpenReached,
  resolveSwipeRelease,
  SWIPE_COMMIT_RATIO,
  SWIPE_HAPTIC_HYSTERESIS,
  SWIPE_OPEN_WIDTH,
  SWIPE_REDUCED_MOTION,
  SWIPE_RUBBER_BAND,
  SWIPE_SNAP_SPRING,
  type CorreoSwipeSide,
} from "./row-swipe-gesture";

export type { CorreoSwipeSide } from "./row-swipe-gesture";
export {
  SWIPE_COMMIT_RATIO,
  SWIPE_OPEN_WIDTH,
  SWIPE_BUTTON_WIDTH,
} from "./row-swipe-gesture";

const LONG_PRESS_MS = 400;
const LONG_PRESS_MOVE = 10;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function snapTransition() {
  return prefersReducedMotion() ? SWIPE_REDUCED_MOTION : SWIPE_SNAP_SPRING;
}

/**
 * Swipe de dos niveles sobre `drag="x"` de framer-motion:
 * - `dragDirectionLock` cede el eje vertical al scroll nativo
 * - sin setState por frame (hápticas vía `x.on("change")`; lado solo al cambiar signo)
 * - touch-action fijo `pan-y` (nunca mutado en runtime)
 * - ≤2–3 hápticas por gesto con histéresis
 */
export function useRowSwipe(opts: {
  enabled: boolean;
  onCommitSwipe: (side: CorreoSwipeSide) => void;
  onLongPress?: () => void;
}) {
  const { enabled, onCommitSwipe, onLongPress } = opts;
  const x = useMotionValue(0);
  const [openSide, setOpenSide] = useState<CorreoSwipeSide | null>(null);
  const [dragging, setDragging] = useState(false);
  const [dragSide, setDragSide] = useState<CorreoSwipeSide | null>(null);

  const openReachedRef = useRef(false);
  const armedRef = useRef(false);
  const lastSignRef = useRef(0);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const rowWidthRef = useRef(360);
  const openSideRef = useRef<CorreoSwipeSide | null>(null);
  const draggingRef = useRef(false);
  const suppressClick = useRef(false);
  const longPressTimer = useRef<number | null>(null);
  const longPressed = useRef(false);
  const longPressStart = useRef({ x: 0, y: 0 });
  const scrollLocked = useRef(false);
  const dragBaseRef = useRef(0);
  const onCommitRef = useRef(onCommitSwipe);
  const onLongPressRef = useRef(onLongPress);

  openSideRef.current = openSide;
  onCommitRef.current = onCommitSwipe;
  onLongPressRef.current = onLongPress;

  const clearLongPress = useCallback(() => {
    if (longPressTimer.current != null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const releaseScrollLock = useCallback(() => {
    if (!scrollLocked.current) return;
    scrollLocked.current = false;
    unlockSwipeScroll();
  }, []);

  useEffect(() => clearLongPress, [clearLongPress]);
  useEffect(() => () => releaseScrollLock(), [releaseScrollLock]);

  const measureWidth = useCallback(() => {
    const node = rowRef.current;
    if (!node) return rowWidthRef.current;
    const w = node.getBoundingClientRect().width || node.offsetWidth;
    if (w > 0) rowWidthRef.current = w;
    return rowWidthRef.current;
  }, []);

  const resetFeedback = useCallback(() => {
    openReachedRef.current = false;
    armedRef.current = false;
    lastSignRef.current = 0;
  }, []);

  const animateTo = useCallback(
    (target: number) => {
      void animate(x, target, snapTransition());
    },
    [x],
  );

  const close = useCallback(() => {
    setOpenSide(null);
    resetFeedback();
    animateTo(0);
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

  // Hápticas sin setState por frame. El lado solo cambia al cruzar cero.
  useEffect(() => {
    return x.on("change", (value) => {
      if (!draggingRef.current && openSideRef.current == null) return;
      const abs = Math.abs(value);
      const width = rowWidthRef.current || 1;
      const sign = value === 0 ? 0 : value > 0 ? 1 : -1;

      if (sign !== 0 && sign !== lastSignRef.current) {
        lastSignRef.current = sign;
        openReachedRef.current = false;
        armedRef.current = false;
        const nextSide: CorreoSwipeSide = sign > 0 ? "right" : "left";
        setDragSide((prev) => (prev === nextSide ? prev : nextSide));
      }

      if (isSwipeOpenReached(abs)) {
        if (!openReachedRef.current) {
          openReachedRef.current = true;
          void triggerHaptic("selection");
        }
      } else if (abs < SWIPE_OPEN_WIDTH - SWIPE_HAPTIC_HYSTERESIS) {
        openReachedRef.current = false;
      }

      if (isSwipeArmed(abs, width)) {
        if (!armedRef.current) {
          armedRef.current = true;
          void triggerHaptic("medium");
        }
      } else if (abs < width * SWIPE_COMMIT_RATIO - SWIPE_HAPTIC_HYSTERESIS) {
        armedRef.current = false;
      }
    });
  }, [x]);

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!event.isPrimary) return;
    if (!enabled && !onLongPressRef.current) return;
    longPressStart.current = { x: event.clientX, y: event.clientY };
    longPressed.current = false;
    suppressClick.current = false;
    if (onLongPressRef.current) {
      clearLongPress();
      longPressTimer.current = window.setTimeout(() => {
        longPressTimer.current = null;
        longPressed.current = true;
        suppressClick.current = true;
        void triggerHaptic("selection");
        onLongPressRef.current?.();
      }, LONG_PRESS_MS);
    }
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (longPressTimer.current == null) return;
    const dx = event.clientX - longPressStart.current.x;
    const dy = event.clientY - longPressStart.current.y;
    if (Math.abs(dx) > LONG_PRESS_MOVE || Math.abs(dy) > LONG_PRESS_MOVE) {
      clearLongPress();
    }
  }

  function onPointerUp() {
    clearLongPress();
  }

  function onDragStart() {
    clearLongPress();
    if (longPressed.current || !enabled) return;

    measureWidth();
    dragBaseRef.current =
      openSideRef.current === "right"
        ? SWIPE_OPEN_WIDTH
        : openSideRef.current === "left"
          ? -SWIPE_OPEN_WIDTH
          : 0;

    resetFeedback();
    draggingRef.current = true;
    setDragging(true);
    const initialSide: CorreoSwipeSide =
      dragBaseRef.current > 0 ? "right" : dragBaseRef.current < 0 ? "left" : "right";
    lastSignRef.current =
      dragBaseRef.current > 0 ? 1 : dragBaseRef.current < 0 ? -1 : 0;
    setDragSide(initialSide);

    if (!scrollLocked.current) {
      scrollLocked.current = true;
      lockSwipeScroll();
    }
  }

  function onDragEnd(
    _event: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo,
  ) {
    releaseScrollLock();
    draggingRef.current = false;
    setDragging(false);
    setDragSide(null);

    if (longPressed.current) {
      longPressed.current = false;
      return;
    }
    if (!enabled) return;

    suppressClick.current = true;
    const width = rowWidthRef.current || measureWidth() || 360;
    const value = dragBaseRef.current + info.offset.x;
    const outcome = resolveSwipeRelease({
      value,
      rowWidth: width,
      velocityX: info.velocity.x,
    });

    if (outcome.type === "commit") {
      setOpenSide(null);
      resetFeedback();
      animateTo(0);
      void triggerHaptic("success");
      onCommitRef.current(outcome.side);
      return;
    }

    if (outcome.type === "snap") {
      setOpenSide(outcome.side);
      const target =
        outcome.side === "right" ? SWIPE_OPEN_WIDTH : -SWIPE_OPEN_WIDTH;
      resetFeedback();
      animateTo(target);
      return;
    }

    close();
  }

  const wasDragged = useCallback(() => {
    const value = suppressClick.current;
    suppressClick.current = false;
    return value;
  }, []);

  const constraint = SWIPE_OPEN_WIDTH;

  return {
    x,
    openSide,
    dragging,
    dragSide,
    /** Fijo: nunca mutar en runtime (WebKit evalúa touch-action al inicio). */
    touchAction: "pan-y" as const,
    rowRef,
    rowWidthRef,
    measureWidth,
    close,
    wasDragged,
    longPressHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
    },
    dragProps: {
      drag: enabled ? ("x" as const) : (false as const),
      dragDirectionLock: true as const,
      // 1:1 hasta OPEN; más allá rubber-band vía dragElastic.
      dragConstraints: { left: -constraint, right: constraint },
      dragElastic: SWIPE_RUBBER_BAND,
      dragMomentum: false as const,
      onDragStart,
      onDragEnd,
    },
  };
}
