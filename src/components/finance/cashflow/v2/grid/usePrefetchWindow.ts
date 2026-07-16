"use client";

import { useEffect, useRef } from "react";
import { addWeeksUTC, endOfIsoWeekUTC } from "./week-keys";

type EnsureRange = (from: Date, to: Date) => Promise<void>;

/**
 * Prefetch en idle de las ventanas adyacentes (siguiente, luego anterior).
 * Solo desktop — en móvil no se llama (ahorro de datos / batería).
 *
 * Guarda: no corre si `loading` o si la ventana visible aún tiene columnas
 * pendientes (prioridad al fill visible; evita competir con chunks de 24s).
 * Cancela si el ancla/horizonte cambió antes del idle (token de generación).
 */
export function usePrefetchWindow(opts: {
  enabled: boolean;
  anchorDate: Date;
  windowWeeks: number;
  loading: boolean;
  /** Columnas visibles aún sin datos — si > 0, no prefetch. */
  pendingCount?: number;
  ensureRange: EnsureRange;
}) {
  const {
    enabled,
    anchorDate,
    windowWeeks,
    loading,
    pendingCount = 0,
    ensureRange,
  } = opts;
  const genRef = useRef(0);
  const loadingRef = useRef(loading);
  loadingRef.current = loading;
  const pendingRef = useRef(pendingCount);
  pendingRef.current = pendingCount;

  useEffect(() => {
    if (!enabled) return;
    const gen = ++genRef.current;
    const anchor = anchorDate;
    const weeks = windowWeeks;

    const run = () => {
      if (gen !== genRef.current) return;
      if (loadingRef.current || pendingRef.current > 0) return;
      const nextFrom = addWeeksUTC(anchor, weeks);
      const nextTo = endOfIsoWeekUTC(addWeeksUTC(anchor, 2 * weeks - 1));
      const prevFrom = addWeeksUTC(anchor, -weeks);
      const prevTo = endOfIsoWeekUTC(addWeeksUTC(anchor, -1));
      void (async () => {
        await ensureRange(nextFrom, nextTo);
        if (
          gen !== genRef.current ||
          loadingRef.current ||
          pendingRef.current > 0
        ) {
          return;
        }
        await ensureRange(prevFrom, prevTo);
      })();
    };

    let idleId: number | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const ric = (
      globalThis as typeof globalThis & {
        requestIdleCallback?: (
          cb: () => void,
          opts?: { timeout: number },
        ) => number;
        cancelIdleCallback?: (id: number) => void;
      }
    ).requestIdleCallback;

    if (typeof ric === "function") {
      idleId = ric(run, { timeout: 1500 });
    } else {
      timeoutId = setTimeout(run, 300);
    }

    return () => {
      genRef.current += 1;
      if (idleId != null) {
        (
          globalThis as typeof globalThis & {
            cancelIdleCallback?: (id: number) => void;
          }
        ).cancelIdleCallback?.(idleId);
      }
      if (timeoutId != null) clearTimeout(timeoutId);
    };
  }, [enabled, anchorDate, windowWeeks, ensureRange, loading, pendingCount]);
}
