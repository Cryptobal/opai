"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useVisualViewportFrame } from "@/hooks/useVisualViewportFrame";

/**
 * Overlay de sheet del composer anclado al visualViewport: con teclado iOS
 * abierto, `fixed inset-0 items-end` deja el sheet detrás del teclado; este
 * contenedor usa top/height del VV para que el fondo visible sea el real.
 */
export function ComposerSheetPortal({
  open,
  onClose,
  children,
  zClass = "z-[70]",
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  zClass?: string;
}) {
  const vv = useVisualViewportFrame();
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div
      data-composer-sheet
      className={`fixed inset-x-0 ${zClass} flex items-end justify-center bg-black/40`}
      style={{ top: vv.top, height: vv.height || "100dvh" }}
      onClick={onClose}
      role="presentation"
    >
      {children}
    </div>,
    document.body,
  );
}
