"use client";

import { useCallback, useEffect, useState } from "react";
import { useReaderResize } from "@/components/crm/correos/useReaderResize";

const STORAGE_KEY = "opai.crm.entity-reader.width.v1";
const DEFAULT_WIDTH = 560;
const MIN_WIDTH = 420;

function clampEntityReaderWidth(width: number): number {
  if (typeof window === "undefined") return Math.round(width);
  const upper = Math.max(MIN_WIDTH, window.innerWidth - 320);
  return Math.round(Math.min(Math.max(width, MIN_WIDTH), upper));
}

/**
 * Ancho persistido del lector de conversaciones en fichas CRM.
 * Clave y defaults propios (no comparte con el módulo Correo).
 */
export function useEntityReaderWidth() {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const n = Number(raw);
        if (Number.isFinite(n)) {
          setWidth(clampEntityReaderWidth(n));
        }
      }
    } catch {
      /* storage bloqueado → default */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, String(width));
      } catch {
        /* ignore */
      }
    }, 120);
    return () => window.clearTimeout(timer);
  }, [hydrated, width]);

  useEffect(() => {
    const onResize = () => setWidth((w) => clampEntityReaderWidth(w));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const clamp = useCallback((next: number) => clampEntityReaderWidth(next), []);

  const reset = useCallback(() => {
    setWidth(clampEntityReaderWidth(DEFAULT_WIDTH));
  }, []);

  const { onResizePointerDown, onResizeKeyDown } = useReaderResize({
    width,
    setWidth,
    clamp,
    onReset: reset,
  });

  return {
    width,
    reset,
    onResizePointerDown,
    onResizeKeyDown,
  };
}
