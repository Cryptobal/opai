"use client";

import { useEffect, useState } from "react";

export type VisualViewportFrame = {
  /** Offset superior del viewport visible (iOS lo mueve al abrir el teclado). */
  top: number;
  /** Alto del viewport visible. */
  height: number;
  /** Inset inferior ≈ alto del teclado; 0 si no hay teclado. */
  keyboardInset: number;
};

const INITIAL: VisualViewportFrame = {
  top: 0,
  height: typeof window !== "undefined" ? window.innerHeight : 0,
  keyboardInset: 0,
};

/**
 * Enmarca overlays fullscreen al `visualViewport` real.
 *
 * En iOS, al abrir el teclado el layout viewport no se encoge pero
 * `visualViewport.offsetTop` crece: un `fixed inset-0` queda parcialmente
 * fuera de pantalla y la topbar (Enviar) desaparece. Anclar `top`/`height`
 * a este frame mantiene el chrome visible sobre el teclado.
 */
export function useVisualViewportFrame(): VisualViewportFrame {
  const [frame, setFrame] = useState<VisualViewportFrame>(INITIAL);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      const top = Math.max(0, vv.offsetTop);
      const height = Math.max(0, vv.height);
      const rawInset = window.innerHeight - vv.height - vv.offsetTop;
      setFrame({
        top,
        height: height || window.innerHeight,
        keyboardInset: rawInset > 50 ? rawInset : 0,
      });
    };

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    window.addEventListener("orientationchange", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  return frame;
}
