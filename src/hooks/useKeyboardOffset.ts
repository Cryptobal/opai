"use client";

import { useEffect, useState } from "react";

/**
 * Detecta el alto del teclado virtual en móviles usando `window.visualViewport`.
 *
 * Cuando el teclado se abre, `visualViewport.height` decrece mientras que
 * `window.innerHeight` se mantiene; la diferencia es el offset del teclado.
 *
 * Además, cuando el teclado se abre fuerza un `scrollIntoView` del input
 * con foco. Esto resuelve el bug en sheets/drawers fixed-bottom donde el
 * input queda oculto detrás del teclado y al escribir "desaparece el texto"
 * (el texto está, pero el input está fuera del viewport visible).
 *
 * Usar el valor devuelto para aplicar `bottom: ${offset}px` y/o reducir
 * `max-height` del contenedor fijo al fondo, igual que hace DialogContent.
 */
export function useKeyboardOffset(): number {
  const [keyboardOffset, setKeyboardOffset] = useState(0);

  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return;

    let scrollTimer: ReturnType<typeof setTimeout> | null = null;

    const handleResize = () => {
      const offset = window.innerHeight - vv.height;
      const newOffset = offset > 50 ? offset : 0;
      setKeyboardOffset(newOffset);

      // Al abrirse el teclado (offset crece), llevar el input enfocado al
      // centro tras el reflow del contenedor. 150ms da margen para el
      // ajuste de tamaño del Sheet/Dialog.
      if (newOffset > 50) {
        if (scrollTimer) clearTimeout(scrollTimer);
        scrollTimer = setTimeout(() => {
          const active = document.activeElement as HTMLElement | null;
          if (
            active &&
            (active.tagName === "INPUT" ||
              active.tagName === "TEXTAREA" ||
              active.isContentEditable)
          ) {
            active.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        }, 150);
      }
    };

    vv.addEventListener("resize", handleResize);
    return () => {
      vv.removeEventListener("resize", handleResize);
      if (scrollTimer) clearTimeout(scrollTimer);
    };
  }, []);

  return keyboardOffset;
}
