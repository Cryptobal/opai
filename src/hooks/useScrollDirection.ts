"use client";

import { useEffect, useRef, useState } from "react";

/**
 * useScrollDirection — hide-on-scroll para la isla nav.
 *
 * `hidden` pasa a true cuando el usuario baja más de `threshold` px y a false
 * al subir. Usa el scroll del documento (window). Respeta
 * `prefers-reduced-motion` (nunca oculta). SSR-safe.
 */
export function useScrollDirection(threshold = 60): boolean {
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);
  const ticking = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    lastY.current = window.scrollY;

    const onScroll = () => {
      if (ticking.current) return;
      ticking.current = true;
      requestAnimationFrame(() => {
        const y = Math.max(0, window.scrollY);
        const delta = y - lastY.current;
        if (y < threshold) {
          setHidden(false);
        } else if (delta > 6) {
          setHidden(true);
        } else if (delta < -6) {
          setHidden(false);
        }
        lastY.current = y;
        ticking.current = false;
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);

  return hidden;
}
