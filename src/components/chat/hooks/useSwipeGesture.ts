"use client";

import { useCallback, useRef, useState } from "react";

const SWIPE_THRESHOLD = 60;
const VELOCITY_THRESHOLD = 0.3;

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
  /** Solo activar en móvil */
  mobileOnly?: boolean;
}

/**
 * Hook para detectar gestos de swipe (deslizar) en móvil.
 * Retorna handlers para onTouchStart/Move/End y opcionalmente
 * un valor de translate para feedback visual.
 */
export function useSwipeGesture(options: UseSwipeGestureOptions): SwipeHandlers & { translateX?: number; translateY?: number } {
  const {
    onSwipeRight,
    onSwipeLeft,
    onSwipeDown,
    onSwipeUp,
    followFinger = false,
    mobileOnly = true,
  } = options;

  const startRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const lastRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const [translate, setTranslate] = useState<{ x: number; y: number } | null>(null);

  const handleStart = useCallback(
    (e: React.TouchEvent) => {
      if (mobileOnly && typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches) return;
      const t = e.touches[0];
      startRef.current = { x: t.clientX, y: t.clientY, t: Date.now() };
      lastRef.current = { x: t.clientX, y: t.clientY, t: Date.now() };
      if (followFinger) setTranslate({ x: 0, y: 0 });
    },
    [mobileOnly, followFinger]
  );

  const handleMove = useCallback(
    (e: React.TouchEvent) => {
      if (!startRef.current) return;
      const t = e.touches[0];
      const dx = t.clientX - startRef.current.x;
      const dy = t.clientY - startRef.current.y;
      lastRef.current = { x: t.clientX, y: t.clientY, t: Date.now() };

      if (followFinger) {
        // Limitar el arrastre para que no se vaya demasiado
        setTranslate({ x: dx, y: dy });
      }
    },
    [followFinger]
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

      if (followFinger) setTranslate(null);

      // Swipe right: dx > threshold o velocidad positiva
      if ((dx > SWIPE_THRESHOLD || vx > VELOCITY_THRESHOLD) && Math.abs(dy) < Math.abs(dx) * 1.5) {
        onSwipeRight?.();
        startRef.current = null;
        lastRef.current = null;
        return;
      }
      // Swipe left
      if ((dx < -SWIPE_THRESHOLD || vx < -VELOCITY_THRESHOLD) && Math.abs(dy) < Math.abs(dx) * 1.5) {
        onSwipeLeft?.();
        startRef.current = null;
        lastRef.current = null;
        return;
      }
      // Swipe down
      if ((dy > SWIPE_THRESHOLD || vy > VELOCITY_THRESHOLD) && Math.abs(dx) < Math.abs(dy) * 1.5) {
        onSwipeDown?.();
        startRef.current = null;
        lastRef.current = null;
        return;
      }
      // Swipe up
      if ((dy < -SWIPE_THRESHOLD || vy < -VELOCITY_THRESHOLD) && Math.abs(dx) < Math.abs(dy) * 1.5) {
        onSwipeUp?.();
        startRef.current = null;
        lastRef.current = null;
        return;
      }

      startRef.current = null;
      lastRef.current = null;
    },
    [onSwipeRight, onSwipeLeft, onSwipeDown, onSwipeUp, followFinger]
  );

  return {
    onTouchStart: handleStart,
    onTouchMove: handleMove,
    onTouchEnd: handleEnd,
    translateX: translate?.x,
    translateY: translate?.y,
  };
}
