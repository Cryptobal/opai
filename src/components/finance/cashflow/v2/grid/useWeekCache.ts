"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { ProjectionMatrix } from "@/modules/finance/cashflow/types";
import {
  dropWeeks,
  mergeMatrix,
  replaceWeeks,
  sliceMatrix,
} from "./week-cache-merge";
import {
  endOfIsoWeekUTC,
  findMissingGap,
  type WeekSlot,
} from "./week-keys";

/**
 * Caché de semanas ya proyectadas, indexada por `bucketKey`.
 *
 * Navegar dentro de lo cacheado es instantáneo. Solo se piden los HUECOS.
 * Fetches paralelos de rangos distintos son válidos y se fusionan; el token
 * de invalidación solo descarta respuestas lanzadas ANTES de un invalidate.
 */
export function useWeekCache(initial: ProjectionMatrix) {
  const mergedRef = useRef<ProjectionMatrix>(initial);
  // `staleRef` marca que el caché quedó invalidado (move/cierre): el próximo
  // merge REEMPLAZA desde null (solo el primero; luego se consume).
  const staleRef = useRef(false);
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(false);
  /** Solo se incrementa en invalidate / invalidateWeeks. */
  const invalidationToken = useRef(0);
  const inflightRef = useRef(0);
  /** Dedup: mismo hueco en vuelo reusa la misma promise. */
  const flightRef = useRef<{
    fromMs: number;
    toMs: number;
    promise: Promise<void>;
  } | null>(null);

  const fetchRange = useCallback(
    async (from: Date, to: Date): Promise<ProjectionMatrix | null> => {
      const qs = new URLSearchParams({
        from: from.toISOString(),
        to: to.toISOString(),
        granularity: "weekly",
      });
      const r = await fetch(`/api/finance/cashflow/projection?${qs}`, {
        cache: "no-store",
      });
      const j = await r.json();
      return j?.success ? (j.data as ProjectionMatrix) : null;
    },
    [],
  );

  const presentKeys = useMemo(() => {
    void version;
    return new Set(mergedRef.current.buckets.map((b) => b.key));
  }, [version]);

  /** Garantiza `[from, to]` en caché. Idempotente sin huecos (sin fetch). */
  const ensureRange = useCallback(
    async (from: Date, to: Date) => {
      const present = new Set(mergedRef.current.buckets.map((b) => b.key));
      const gap = findMissingGap(present, from, to, staleRef.current);
      if (!gap) return;

      const fromMs = gap.first.getTime();
      const toMs = gap.last.getTime();
      const flight = flightRef.current;
      if (flight && flight.fromMs === fromMs && flight.toMs === toMs) {
        await flight.promise;
        return;
      }

      const token = invalidationToken.current;
      inflightRef.current += 1;
      setLoading(true);
      let promise!: Promise<void>;
      promise = (async () => {
        try {
          const next = await fetchRange(gap.first, endOfIsoWeekUTC(gap.last));
          // Respuesta lanzada antes de un invalidate → datos viejos, se descarta.
          if (token !== invalidationToken.current) return;
          if (!next) {
            toast.error("No se pudieron cargar esas semanas");
            return;
          }
          // Reemplazo desde null solo si stale sigue true al mergear; el primer
          // merge post-invalidate lo consume para que fetches paralelos fusionen.
          const replace = staleRef.current;
          if (replace) staleRef.current = false;
          mergedRef.current = mergeMatrix(
            replace ? null : mergedRef.current,
            next,
          );
          setVersion((v) => v + 1);
        } catch {
          if (token === invalidationToken.current) {
            toast.error("Error de red al cargar semanas");
          }
        } finally {
          if (flightRef.current?.promise === promise) flightRef.current = null;
          inflightRef.current = Math.max(0, inflightRef.current - 1);
          setLoading(inflightRef.current > 0);
        }
      })();
      flightRef.current = { fromMs, toMs, promise };
      await promise;
    },
    [fetchRange],
  );

  const resolve = useCallback(
    (slots: WeekSlot[]): ProjectionMatrix =>
      sliceMatrix(mergedRef.current, slots),
    [],
  );

  const invalidate = useCallback(() => {
    staleRef.current = true;
    invalidationToken.current += 1;
  }, []);

  const invalidateWeeks = useCallback((keys: string[]) => {
    if (keys.length === 0) return;
    mergedRef.current = dropWeeks(mergedRef.current, keys);
    invalidationToken.current += 1;
    setVersion((v) => v + 1);
  }, []);

  const patchMatrix = useCallback((incoming: ProjectionMatrix) => {
    mergedRef.current = replaceWeeks(mergedRef.current, incoming);
    setVersion((v) => v + 1);
  }, []);

  return {
    ensureRange,
    resolve,
    invalidate,
    invalidateWeeks,
    patchMatrix,
    loading,
    version,
    presentKeys,
  };
}
