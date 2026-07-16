"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { ProjectionMatrix } from "@/modules/finance/cashflow/types";
import { dropWeeks, mergeMatrix, sliceMatrix } from "./week-cache-merge";
import {
  addWeeksUTC,
  endOfIsoWeekUTC,
  startOfIsoWeekUTC,
  weekKey,
  type WeekSlot,
} from "./week-keys";

/**
 * Caché de semanas ya proyectadas, indexada por `bucketKey`.
 *
 * Navegar dentro de lo cacheado es instantáneo. Solo se piden los HUECOS.
 * `loading` indica fetch en vuelo (prefetch / UI), pero las flechas NO se
 * bloquean: el ancla se mueve al instante y las columnas pendientes muestran
 * skeleton hasta que el merge actualiza `version`.
 */
export function useWeekCache(initial: ProjectionMatrix) {
  const mergedRef = useRef<ProjectionMatrix>(initial);
  // `staleRef` marca que el caché quedó invalidado (move/cierre): el próximo
  // fetch REEMPLAZA en vez de fusionar, y fuerza red aunque las keys "existan".
  const staleRef = useRef(false);
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(false);
  const loadToken = useRef(0);
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
      // `no-store`: tras un move/ocultar, `refresh()` re-pide EXACTAMENTE la
      // misma ventana (mismo from/to → misma URL). Con el caché HTTP por
      // defecto el navegador devolvía la respuesta vieja y la fila ocultada no
      // desaparecía / la movida no aparecía hasta recargar a mano. El buscador
      // de folios no sufría esto porque salta a otro rango (URL nueva). La
      // proyección es estado vivo: nunca debe servirse cacheada.
      const r = await fetch(`/api/finance/cashflow/projection?${qs}`, {
        cache: "no-store",
      });
      const j = await r.json();
      return j?.success ? (j.data as ProjectionMatrix) : null;
    },
    [],
  );

  /** Keys presentes en el caché (se recalcula con cada merge / poda). */
  const presentKeys = useMemo(() => {
    void version;
    return new Set(mergedRef.current.buckets.map((b) => b.key));
  }, [version]);

  /** Garantiza que todas las semanas de `[from, to]` estén cacheadas. Si ya lo
   *  están (y el caché no está stale) retorna sin fetch ni setState. Si faltan,
   *  hace UN solo fetch que cubre exactamente el hueco contiguo (de la primera a
   *  la última semana faltante). El merge por bucketKey conserva lo ya cacheado,
   *  así que pedir sólo el hueco basta para pintar toda la ventana. */
  const ensureRange = useCallback(
    async (from: Date, to: Date) => {
      const stale = staleRef.current;
      const present = new Set(mergedRef.current.buckets.map((b) => b.key));
      let firstMissing: Date | null = null;
      let lastMissing: Date | null = null;
      const last = startOfIsoWeekUTC(to).getTime();
      for (
        let cur = startOfIsoWeekUTC(from);
        cur.getTime() <= last;
        cur = addWeeksUTC(cur, 1)
      ) {
        // stale (post-invalidate) → toda la ventana cuenta como faltante.
        if (stale || !present.has(weekKey(cur))) {
          if (!firstMissing) firstMissing = cur;
          lastMissing = cur;
        }
      }
      if (!firstMissing || !lastMissing) return; // todo cacheado

      const gapFrom = firstMissing;
      const gapTo = lastMissing;
      const fromMs = gapFrom.getTime();
      const toMs = gapTo.getTime();
      const flight = flightRef.current;
      if (flight && flight.fromMs === fromMs && flight.toMs === toMs) {
        await flight.promise;
        return;
      }

      const token = ++loadToken.current;
      setLoading(true);
      const promise = (async () => {
        try {
          const next = await fetchRange(gapFrom, endOfIsoWeekUTC(gapTo));
          if (token !== loadToken.current) return; // respuesta stale, se descarta
          if (!next) {
            toast.error("No se pudieron cargar esas semanas");
            return;
          }
          // Tras invalidate() se reemplaza desde cero; si no, se fusiona.
          mergedRef.current = mergeMatrix(stale ? null : mergedRef.current, next);
          staleRef.current = false;
          setVersion((v) => v + 1);
        } catch {
          if (token === loadToken.current) {
            toast.error("Error de red al cargar semanas");
          }
        } finally {
          if (flightRef.current?.promise === promise) flightRef.current = null;
          if (token === loadToken.current) setLoading(false);
        }
      })();
      flightRef.current = { fromMs, toMs, promise };
      await promise;
    },
    [fetchRange],
  );

  /** Matriz derivada para las columnas visibles, resuelta contra el caché. */
  const resolve = useCallback(
    (slots: WeekSlot[]): ProjectionMatrix =>
      sliceMatrix(mergedRef.current, slots),
    [],
  );

  /** Marca el caché como stale (lo llama refresh tras un move/cierre). El
   *  siguiente ensureRange reemplaza con datos frescos. */
  const invalidate = useCallback(() => {
    staleRef.current = true;
  }, []);

  /**
   * Poda selectiva: quita del caché sólo las semanas en `keys` (sin tocar
   * `staleRef`). El próximo `ensureRange` las detecta como huecos y re-fetchea
   * solo ese rango. Usado tras mutaciones de grilla (move/amount/hide).
   */
  const invalidateWeeks = useCallback((keys: string[]) => {
    if (keys.length === 0) return;
    mergedRef.current = dropWeeks(mergedRef.current, keys);
    setVersion((v) => v + 1);
  }, []);

  return {
    ensureRange,
    resolve,
    invalidate,
    invalidateWeeks,
    loading,
    version,
    presentKeys,
  };
}
