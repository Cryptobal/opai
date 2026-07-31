"use client";

/**
 * Focus-trap + Escape para el overlay del lector (C19, PR-14):
 *  - Al abrir, mueve el foco al panel; al cerrar, lo devuelve a su origen.
 *  - Tab/Shift+Tab ciclan dentro del panel mientras es un overlay real
 *    (móvil o modo overlay de desktop); en split desktop no atrapa.
 *  - Escape cierra siempre.
 */

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  opts: { active: boolean; trap: boolean; onEscape: () => void },
): void {
  const { active, trap, onEscape } = opts;
  // Ref sincronizado: al pausar trap (composer) el cleanup no debe restaurar
  // el foco; solo al cerrar el panel (`active` → false).
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    if (!active) return;
    const panel = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    if (trap && panel) {
      const first = panel.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? panel).focus?.();
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onEscape();
        return;
      }
      if (!trap || event.key !== "Tab" || !panel) return;
      const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (focusables.length === 0) return;
      const firstEl = focusables[0];
      const lastEl = focusables[focusables.length - 1];
      const current = document.activeElement;
      if (event.shiftKey && (current === firstEl || !panel.contains(current))) {
        event.preventDefault();
        lastEl.focus();
      } else if (!event.shiftKey && current === lastEl) {
        event.preventDefault();
        firstEl.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      // Pausar trap (composer abierto) no restaura; cerrar el lector sí,
      // y solo si el origen sigue en el documento.
      if (trap && !activeRef.current && previous && document.contains(previous)) {
        previous.focus?.();
      }
    };
  }, [ref, active, trap, onEscape]);
}
