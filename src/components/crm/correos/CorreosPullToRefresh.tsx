"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { isSwipeScrollLocked } from "@/lib/swipe-scroll-lock";
import { triggerHaptic } from "@/lib/haptics";

const PULL_THRESHOLD = 64;
const MAX_PULL = 96;
const RESISTANCE = 0.42;

type Props = {
  onRefresh: () => Promise<void> | void;
  /** Desactiva el gesto (p. ej. sync en curso desde el drawer). */
  disabled?: boolean;
  children: ReactNode;
  className?: string;
};

function scrollTop(): number {
  if (typeof window === "undefined") return 0;
  return window.scrollY || document.documentElement.scrollTop || 0;
}

/**
 * Pull-to-refresh para la bandeja móvil (scroll de documento).
 * Solo actúa en el tope; el indicador crece debajo de la top bar fija.
 * Usa listener no-pasivo en touchmove para cortar el rubber-band nativo
 * del PWA (que despega la top bar fija en iOS).
 */
export function CorreosPullToRefresh({
  onRefresh,
  disabled,
  children,
  className,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef<number | null>(null);
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);
  const disabledRef = useRef(!!disabled);
  const onRefreshRef = useRef(onRefresh);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  disabledRef.current = !!disabled;
  onRefreshRef.current = onRefresh;
  refreshingRef.current = refreshing;

  const setPullBoth = useCallback((n: number) => {
    pullRef.current = n;
    setPull(n);
  }, []);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      if (disabledRef.current || refreshingRef.current || isSwipeScrollLocked()) return;
      // Solo móvil (<lg): en desktop el toolbar ya tiene refresh.
      if (window.matchMedia("(min-width: 1024px)").matches) return;
      if (scrollTop() > 1) {
        startYRef.current = null;
        return;
      }
      startYRef.current = e.touches[0].clientY;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (startYRef.current === null || disabledRef.current || refreshingRef.current) return;
      // Swipe horizontal de fila activo: no competir con pull-to-refresh.
      if (isSwipeScrollLocked()) {
        startYRef.current = null;
        setPullBoth(0);
        return;
      }
      if (scrollTop() > 1) {
        startYRef.current = null;
        setPullBoth(0);
        return;
      }
      const dy = e.touches[0].clientY - startYRef.current;
      if (dy <= 0) {
        setPullBoth(0);
        return;
      }
      // Corta el overscroll nativo que arrastra la top bar fija en PWA.
      if (e.cancelable) e.preventDefault();
      setPullBoth(Math.min(dy * RESISTANCE, MAX_PULL));
    };

    const onTouchEnd = async () => {
      if (startYRef.current === null) {
        setPullBoth(0);
        return;
      }
      startYRef.current = null;
      const current = pullRef.current;
      if (current >= PULL_THRESHOLD && !refreshingRef.current && !disabledRef.current) {
        setRefreshing(true);
        setPullBoth(PULL_THRESHOLD * 0.7);
        void triggerHaptic("light");
        try {
          await onRefreshRef.current();
        } finally {
          setRefreshing(false);
          setPullBoth(0);
        }
      } else {
        setPullBoth(0);
      }
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [setPullBoth]);

  const armed = pull >= PULL_THRESHOLD;

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <div
        aria-hidden
        className={cn(
          "flex items-end justify-center overflow-hidden text-ds-text-3",
          !refreshing && pull === 0 && "transition-[height] duration-200 ease-out",
        )}
        style={{ height: pull }}
      >
        <div className="pb-2">
          {refreshing ? (
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          ) : (
            <ArrowDown
              className={cn(
                "h-5 w-5 transition-transform duration-150",
                armed && "rotate-180 text-primary",
              )}
            />
          )}
        </div>
      </div>
      {children}
    </div>
  );
}
