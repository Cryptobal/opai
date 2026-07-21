"use client";

import { useEffect, useRef } from "react";

/**
 * Cierra el lector con el gesto/botón atrás: al abrir empuja un history state
 * propio; `popstate` → onClose(). Al cerrar manualmente consume ese state con
 * `history.back()` solo si sigue siendo el propio (guard para no romper la
 * navegación del resto de la app).
 */
export function useCloseOnBack(open: boolean, onClose: () => void): void {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    window.history.pushState({ correoReader: true }, "");
    let popped = false;
    const onPop = () => {
      popped = true;
      closeRef.current();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (!popped && window.history.state?.correoReader) {
        window.history.back();
      }
    };
  }, [open]);
}
