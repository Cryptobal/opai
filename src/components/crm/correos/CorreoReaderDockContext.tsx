"use client";

import { createContext, useContext } from "react";

export type CorreoReaderDockValue = {
  /** Nodo del dock inferior (fuera del scroll). Null hasta el primer paint. */
  host: HTMLElement | null;
  /** Fila superior del dock (chips de intención), sobre las acciones. */
  topHost?: HTMLElement | null;
  /** true dentro de CorreoReaderShell (aunque host aún no esté listo). */
  enabled: boolean;
};

const DEFAULT_DOCK: CorreoReaderDockValue = { host: null, topHost: null, enabled: false };

/**
 * Dock inferior del lector para anclar Responder / Reenviar estilo Gmail.
 * `enabled` evita render inline (flash) mientras el ref del host se asigna.
 */
export const CorreoReaderDockContext = createContext<CorreoReaderDockValue>(DEFAULT_DOCK);

export function useCorreoReaderDock(): CorreoReaderDockValue {
  return useContext(CorreoReaderDockContext);
}
