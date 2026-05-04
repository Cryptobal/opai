"use client";

import { useCallback, useRef, useState } from "react";

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
 * Retorna handlers para onTouchStart/Move/End y opcionalmente
 * un valor de translate para feedback visual.
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
    hapticOnComplete = true,
    mobileOnly = true,
    edgeOnly,
    directionLock = true,
  } = options;

  const startRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const lastRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const lockedRef = useRef<"x" | "y" | null>(null);
  const [translate, setTranslate] = useState<{ x: number; y: number } | null>(null);

  const handleStart = useCallback(
    (e: React.TouchEvent) => {
      if (mobileOnly && typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches) return;

      const t = e.touches[0];

      // Edge-only: descarta si no aterriza en el borde indicado
      if (edgeOnly === "left" && t.clientX > EDGE_WIDTH) return;
      if (edgeOnly === "right" && t.clientX < (window.innerWidth - EDGE_WIDTH)) return;

      startRef.current = { x: t.clientX, y: t.clientY, t: Date.now() };
      lastRef.current = { x: t.clientX, y: t.clientY, t: Date.now() };
      lockedRef.current = null;
      if (followFinger) setTranslate({ x: 0, y: 0 });
    },
    [mobileOnly, followFinger, edgeOnly]
  );

  const handleMove = useCallback(
    (e: React.TouchEvent) => {
      if (!startRef.current) return;
      const t = e.touches[0];
      const dx = t.clientX - startRef.current.x;
      const dy = t.clientY - startRef.current.y;
      lastRef.current = { x: t.clientX, y: t.clientY, t: Date.now() };

      // Direction lock: una vez excedido LOCK_DELTA en cualquier eje, lo fija
      if (directionLock && lockedRef.current == null) {
        if (Math.abs(dx) > LOCK_DELTA || Math.abs(dy) > LOCK_DELTA) {
          lockedRef.current = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        }
      }

      if (followFinger) {
        const W = typeof window !== "undefined" ? window.innerWidth : 320;
        // Resistencia exponencial al pasar el 60% del ancho
        const resist = (v: number) => {
          const sign = Math.sign(v);
          const abs = Math.abs(v);
          const limit = W * 0.6;
          if (abs <= limit) return v;
          const over = abs - limit;
          return sign * (limit + Math.log10(1 + over) * 30);
        };
        // Si está locked en x, no movemos en y (y viceversa)
        const tx = lockedRef.current === "y" ? 0 : resist(dx);
        const ty = lockedRef.current === "x" ? 0 : resist(dy);
        setTranslate({ x: tx, y: ty });
      }
    },
    [followFinger, directionLock]
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

      const locked = lockedRef.current;

      // Si direction lock activo y dirección es y, solo aceptamos swipes verticales
      if (directionLock && locked === "y") {
        if ((dy > SWIPE_THRESHOLD || vy > VELOCITY_THRESHOLD) && Math.abs(dx) < Math.abs(dy) * 1.5) {
          if (hapticOnComplete) triggerHaptic();
          onSwipeDown?.();
        } else if ((dy < -SWIPE_THRESHOLD || vy < -VELOCITY_THRESHOLD) && Math.abs(dx) < Math.abs(dy) * 1.5) {
          if (hapticOnComplete) triggerHaptic();
          onSwipeUp?.();
        }
      } else if (directionLock && locked === "x") {
        // Solo horizontales
        if ((dx > SWIPE_THRESHOLD || vx > VELOCITY_THRESHOLD) && Math.abs(dy) < Math.abs(dx) * 1.5) {
          if (hapticOnComplete) triggerHaptic();
          onSwipeRight?.();
        } else if ((dx < -SWIPE_THRESHOLD || vx < -VELOCITY_THRESHOLD) && Math.abs(dy) < Math.abs(dx) * 1.5) {
          if (hapticOnComplete) triggerHaptic();
          onSwipeLeft?.();
        }
      } else {
        // Sin lock: comportamiento original (ambas direcciones)
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
    [onSwipeRight, onSwipeLeft, onSwipeDown, onSwipeUp, followFinger, hapticOnComplete, directionLock]
  );

  return {
    onTouchStart: handleStart,
    onTouchMove: handleMove,
    onTouchEnd: handleEnd,
    translateX: translate?.x,
    translateY: translate?.y,
  };
}
