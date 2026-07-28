"use client";

import { useEffect, useRef, useState } from "react";

/**
 * useScrollDirection — condensación / hide-on-scroll genérico.
 *
 * Retorna `true` cuando el usuario baja más de `threshold` px (contenido
 * sube) y `false` al subir. Usa el scroll del documento (window). Respeta
 * `prefers-reduced-motion` (nunca condensa). SSR-safe.
 *
 * Nota: MobileIsland / BottomNav ya NO condensan al scroll (rompía tamaños
 * de Chat/Pregunta y el backdrop-filter del Liquid Glass). El hook queda
 * disponible para otras superficies que lo necesiten.
 */
export function useScrollDirection(threshold = 60): boolean {
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);
  const accum = useRef(0);
  const ticking = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    lastY.current = window.scrollY;
    accum.current = 0;

    const onScroll = () => {
      if (ticking.current) return;
      ticking.current = true;
      requestAnimationFrame(() => {
        const y = Math.max(0, window.scrollY);
        const delta = y - lastY.current;
        lastY.current = y;

        // Histéresis: acumula delta en la misma dirección y solo cambia de
        // estado tras ~14px, para evitar parpadeos en scrolls cortos/oscilantes.
        if (y < threshold) {
          accum.current = 0;
          setHidden(false);
        } else if (delta !== 0) {
          if ((delta > 0 && accum.current < 0) || (delta < 0 && accum.current > 0)) {
            accum.current = 0;
          }
          accum.current += delta;
          if (accum.current > 14) {
            setHidden(true);
            accum.current = 0;
          } else if (accum.current < -14) {
            setHidden(false);
            accum.current = 0;
          }
        }
        ticking.current = false;
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);

  return hidden;
}
