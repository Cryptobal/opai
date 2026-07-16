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
  capGapWeeks,
  endOfIsoWeekUTC,
  findMissingGap,
  type WeekSlot,
} from "./week-keys";

/**
 * Caché de semanas ya proyectadas, indexada por `bucketKey`.
 *
 * Navegar dentro de lo cacheado es instantáneo. Solo se piden los HUECOS.
 * Los huecos largos se piden en chunks de `FETCH_CHUNK_WEEKS` para que la
 * grilla pinte progreso (evita un solo buildProjection de 16–24 semanas que
 * cuelga o timeout en Vercel → skeleton eterno).
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
  /** Dedup: mismo hueco pedido en vuelo reusa la misma promise. */
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
      if (!r.ok) return null;
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
          // Chunks secuenciales: cada merge pinta columnas nuevas (version++).
          // Re-evalúa el hueco tras cada chunk por si un fetch paralelo ya
          // cubrió parte del rango. Guarda anti-bucle si el server no aporta keys.
          let guardFirstMs: number | null = null;
          while (token === invalidationToken.current) {
            const keys = new Set(
              mergedRef.current.buckets.map((b) => b.key),
            );
            const remaining = findMissingGap(
              keys,
              from,
              to,
              staleRef.current,
            );
            if (!remaining) break;
            if (guardFirstMs === remaining.first.getTime()) {
              toast.error("No se pudieron cargar esas semanas");
              return;
            }
            guardFirstMs = remaining.first.getTime();

            const chunk = capGapWeeks(remaining);
            const next = await fetchRange(
              chunk.first,
              endOfIsoWeekUTC(chunk.last),
            );
            if (token !== invalidationToken.current) return;
            if (!next) {
              toast.error("No se pudieron cargar esas semanas");
              return;
            }
            const replace = staleRef.current;
            if (replace) staleRef.current = false;
            mergedRef.current = mergeMatrix(
              replace ? null : mergedRef.current,
              next,
            );
            setVersion((v) => v + 1);
          }
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
