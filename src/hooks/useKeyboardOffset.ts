"use client";

import { useEffect, useState } from "react";

export type UseKeyboardOffsetOptions = {
  /**
   * Si true (default), al abrir el teclado hace scrollIntoView del input
   * enfocado. Desactivar en sheets full-screen con composer sticky al fondo
   * (p. ej. OPAI Intelligence): el scroll del viewport mueve el sheet y deja
   * el campo de escritura a mitad de pantalla.
   */
  scrollFocusedIntoView?: boolean;
};

/**
 * Detecta el alto del teclado virtual en móviles usando `window.visualViewport`.
 *
 * Cuando el teclado se abre, `visualViewport.height` decrece mientras que
 * `window.innerHeight` se mantiene; la diferencia es el offset del teclado.
 *
 * Además, cuando el teclado se abre fuerza un `scrollIntoView` del input
 * con foco (salvo `scrollFocusedIntoView: false`). Esto resuelve el bug en
 * sheets/drawers fixed-bottom donde el input queda oculto detrás del teclado.
 *
 * Usar el valor devuelto para aplicar `bottom: ${offset}px` y/o reducir
 * `max-height` del contenedor fijo al fondo, igual que hace DialogContent.
 * No combinar reducción de height + paddingBottom con el mismo offset.
 *
 * Advertencia: el padding-bottom de safe-area (`env(safe-area-inset-bottom)`)
 * en bottom sheets NO debe sumarse otra vez cuando `keyboardOffset > 0` —
 * el sheet ya se ancla sobre el teclado con `bottom: offset`. Capacitor con
 * `KeyboardResize.None` depende de este anclaje por visualViewport.
 */
export function useKeyboardOffset(
  options: UseKeyboardOffsetOptions = {},
): number {
  const scrollFocusedIntoView = options.scrollFocusedIntoView !== false;
  const [keyboardOffset, setKeyboardOffset] = useState(0);

  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return;

    let scrollTimer: ReturnType<typeof setTimeout> | null = null;

    const handleResize = () => {
      // offsetTop corrige iOS Safari cuando el layout viewport se desplaza.
      const offset = window.innerHeight - vv.height - vv.offsetTop;
      const newOffset = offset > 50 ? Math.round(offset) : 0;
      setKeyboardOffset(newOffset);

      if (!scrollFocusedIntoView || newOffset <= 50) return;

      if (scrollTimer) clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        const active = document.activeElement as HTMLElement | null;
        if (
          active &&
          (active.tagName === "INPUT" ||
            active.tagName === "TEXTAREA" ||
            active.isContentEditable)
        ) {
          // Dentro del sheet IA full-screen el composer ya queda anclado;
          // scrollIntoView del document lo desarma.
          if (active.closest("[data-opai-ai-sheet]")) return;
          active.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 150);
    };

    vv.addEventListener("resize", handleResize);
    vv.addEventListener("scroll", handleResize);
    return () => {
      vv.removeEventListener("resize", handleResize);
      vv.removeEventListener("scroll", handleResize);
      if (scrollTimer) clearTimeout(scrollTimer);
    };
  }, [scrollFocusedIntoView]);

  return keyboardOffset;
}
