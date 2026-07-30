"use client";

import { createContext, useContext } from "react";

export type CorreoReaderScrollValue = {
  /** true cuando el contenedor de scroll del lector pasó `scrollTop > 24`. */
  scrolled: boolean;
};

const DEFAULT_SCROLL: CorreoReaderScrollValue = { scrolled: false };

/**
 * Estado de scroll del lector, propagado por `CorreoReaderShell`. El header
 * adaptativo móvil lo consume para activar el material glass y migrar el asunto
 * al scrollear, sin acoplar el header al DOM del shell.
 */
export const CorreoReaderScrollContext =
  createContext<CorreoReaderScrollValue>(DEFAULT_SCROLL);

export function useCorreoReaderScroll(): CorreoReaderScrollValue {
  return useContext(CorreoReaderScrollContext);
}
