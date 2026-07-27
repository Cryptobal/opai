"use client";

import { createContext, useContext } from "react";

/**
 * Host DOM del lector (Surface) para overlays absolutos (guardar adjuntos,
 * etc.). En desktop split el sheet queda del ancho del visor; en móvil
 * fullscreen del lector. Evita `fixed inset-0` que cruza el sidebar.
 */
export const CorreoReaderOverlayContext = createContext<HTMLElement | null>(null);

export function useCorreoReaderOverlayHost(): HTMLElement | null {
  return useContext(CorreoReaderOverlayContext);
}
