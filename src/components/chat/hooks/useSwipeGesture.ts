"use client";

import { useCallback, useRef, type RefObject } from "react";

const SWIPE_THRESHOLD = 60;
const VELOCITY_THRESHOLD = 0.3;
const LOCK_DELTA = 8;
const EDGE_WIDTH = 24;

function triggerHaptic() {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    (navigator as Navigator & { vibrate: (p: number | number[]) => boolean }).vibrate(10);
  }
}

interface SwipeHandlers {
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
}

interface UseSwipeGestureOptions {
  onSwipeRight?: () => void;
  onSwipeLeft?: () => void;
  onSwipeDown?: () => void;
  onSwipeUp?: () => void;
  /** Si true, el gesto sigue el dedo con translate (feedback visual) */
  followFinger?: boolean;
  /**
   * Elemento al que aplicar `transform` vía rAF (sin setState).
   * Requerido para followFinger fluido; sin él no hay feedback visual.
   */
  targetRef?: RefObject<HTMLElement | null>;
  /** Vibración al completar el gesto (si el dispositivo lo soporta) */
  hapticOnComplete?: boolean;
  /** Solo activar en móvil */
  mobileOnly?: boolean;
  /** Si está definido, el gesto SOLO se activa si el dedo aterriza en ese borde (24 px) */
  edgeOnly?: "left" | "right";
  /** Bloquea la dirección dominante una vez detectada — evita el "todo se mueve" */
  directionLock?: boolean;
}

/**
 * Hook para detectar gestos de swipe (deslizar) en móvil.
 * Retorna handlers para onTouchStart/Move/End.
 * Con `followFinger` + `targetRef`, escribe el transform en el DOM vía rAF
 * (sin re-renders). `translateX`/`translateY` se mantienen en la firma
 * devolviendo `undefined` por compatibilidad con consumidores legacy.
 */
export function useSwipeGesture(options: UseSwipeGestureOptions): SwipeHandlers & {
  translateX?: number;
  translateY?: number;
} {
  const {
    onSwipeRight,
    onSwipeLeft,
    onSwipeDown,
    onSwipeUp,
    followFinger = false,
    targetRef,
    hapticOnComplete = true,
    mobileOnly = true,
    edgeOnly,
    directionLock = true,
  } = options;

  const startRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const lastRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const lockedRef = useRef<"x" | "y" | null>(null);
  const deltaRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef<number | null>(null);
  const followingRef = useRef(false);

  const applyTransform = useCallback(() => {
    rafRef.current = null;
    const el = targetRef?.current;
    if (!el || !followingRef.current) return;
    const { x, y } = deltaRef.current;
    el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  }, [targetRef]);

  const scheduleTransform = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(applyTransform);
  }, [applyTransform]);

  const clearTransform = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const el = targetRef?.current;
    if (el) {
      el.style.transition = "";
      el.style.transform = "";
    }
    followingRef.current = false;
    deltaRef.current = { x: 0, y: 0 };
  }, [targetRef]);

  const handleStart = useCallback(
    (e: React.TouchEvent) => {
      if (mobileOnly && typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches) return;

      const t = e.touches[0];

      if (edgeOnly === "left" && t.clientX > EDGE_WIDTH) return;
      if (edgeOnly === "right" && t.clientX < window.innerWidth - EDGE_WIDTH) return;

      startRef.current = { x: t.clientX, y: t.clientY, t: Date.now() };
      lastRef.current = { x: t.clientX, y: t.clientY, t: Date.now() };
      lockedRef.current = null;

      if (followFinger && targetRef?.current) {
        followingRef.current = true;
        deltaRef.current = { x: 0, y: 0 };
        targetRef.current.style.transition = "none";
        targetRef.current.style.transform = "translate3d(0,0,0)";
      }
    },
    [mobileOnly, followFinger, edgeOnly, targetRef],
  );

  const handleMove = useCallback(
    (e: React.TouchEvent) => {
      if (!startRef.current) return;
      const t = e.touches[0];
      const dx = t.clientX - startRef.current.x;
      const dy = t.clientY - startRef.current.y;
      lastRef.current = { x: t.clientX, y: t.clientY, t: Date.now() };

      if (directionLock && lockedRef.current == null) {
        if (Math.abs(dx) > LOCK_DELTA || Math.abs(dy) > LOCK_DELTA) {
          lockedRef.current = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        }
      }

      if (followFinger && followingRef.current) {
        const W = typeof window !== "undefined" ? window.innerWidth : 320;
        const resist = (v: number) => {
          const sign = Math.sign(v);
          const abs = Math.abs(v);
          const limit = W * 0.6;
          if (abs <= limit) return v;
          const over = abs - limit;
          return sign * (limit + Math.log10(1 + over) * 30);
        };
        const tx = lockedRef.current === "y" ? 0 : resist(dx);
        const ty = lockedRef.current === "x" ? 0 : resist(dy);
        deltaRef.current = { x: tx, y: ty };
        scheduleTransform();
      }
    },
    [followFinger, directionLock, scheduleTransform],
  );

  const handleEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!startRef.current || !lastRef.current) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - startRef.current.x;
      const dy = t.clientY - startRef.current.y;
      const dt = Date.now() - startRef.current.t;
      const vx = dt > 0 ? dx / dt : 0;
      const vy = dt > 0 ? dy / dt : 0;

      if (followFinger) clearTransform();

      const locked = lockedRef.current;

      if (directionLock && locked === "y") {
        if ((dy > SWIPE_THRESHOLD || vy > VELOCITY_THRESHOLD) && Math.abs(dx) < Math.abs(dy) * 1.5) {
          if (hapticOnComplete) triggerHaptic();
          onSwipeDown?.();
        } else if ((dy < -SWIPE_THRESHOLD || vy < -VELOCITY_THRESHOLD) && Math.abs(dx) < Math.abs(dy) * 1.5) {
          if (hapticOnComplete) triggerHaptic();
          onSwipeUp?.();
        }
      } else if (directionLock && locked === "x") {
        if ((dx > SWIPE_THRESHOLD || vx > VELOCITY_THRESHOLD) && Math.abs(dy) < Math.abs(dx) * 1.5) {
          if (hapticOnComplete) triggerHaptic();
          onSwipeRight?.();
        } else if ((dx < -SWIPE_THRESHOLD || vx < -VELOCITY_THRESHOLD) && Math.abs(dy) < Math.abs(dx) * 1.5) {
          if (hapticOnComplete) triggerHaptic();
          onSwipeLeft?.();
        }
      } else {
        if ((dx > SWIPE_THRESHOLD || vx > VELOCITY_THRESHOLD) && Math.abs(dy) < Math.abs(dx) * 1.5) {
          if (hapticOnComplete) triggerHaptic();
          onSwipeRight?.();
        } else if ((dx < -SWIPE_THRESHOLD || vx < -VELOCITY_THRESHOLD) && Math.abs(dy) < Math.abs(dx) * 1.5) {
          if (hapticOnComplete) triggerHaptic();
          onSwipeLeft?.();
        } else if ((dy > SWIPE_THRESHOLD || vy > VELOCITY_THRESHOLD) && Math.abs(dx) < Math.abs(dy) * 1.5) {
          if (hapticOnComplete) triggerHaptic();
          onSwipeDown?.();
        } else if ((dy < -SWIPE_THRESHOLD || vy < -VELOCITY_THRESHOLD) && Math.abs(dx) < Math.abs(dy) * 1.5) {
          if (hapticOnComplete) triggerHaptic();
          onSwipeUp?.();
        }
      }

      startRef.current = null;
      lastRef.current = null;
      lockedRef.current = null;
    },
    [
      onSwipeRight,
      onSwipeLeft,
      onSwipeDown,
      onSwipeUp,
      followFinger,
      hapticOnComplete,
      directionLock,
      clearTransform,
    ],
  );

  return {
    onTouchStart: handleStart,
    onTouchMove: handleMove,
    onTouchEnd: handleEnd,
    translateX: undefined,
    translateY: undefined,
  };
}
