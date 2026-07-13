"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import type { ProjectionMatrix } from "@/modules/finance/cashflow/types";
import { mergeMatrix, sliceMatrix } from "./week-cache-merge";
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
 * Reemplaza el patrón anterior (recargar un RANGO completo en cada navegación),
 * que recomputaba todas las semanas —15 queries + expandRecurrence de todos los
 * ítems— y además hacía que una misma semana pudiera devolver valores distintos
 * según el rango pedido.
 *
 * Ahora: una semana se pide UNA vez, se guarda y se reusa. Navegar dentro de lo
 * cacheado es instantáneo (cero red). Sólo se piden los HUECOS. No existe el
 * modo `blocking=false`: `loading` es `true` mientras hay fetch en vuelo, así
 * las flechas quedan deshabilitadas y no puede colarse un clic a medio camino
 * (origen del bug de la flecha pegada).
 */
export function useWeekCache(initial: ProjectionMatrix) {
  const mergedRef = useRef<ProjectionMatrix>(initial);
  // `staleRef` marca que el caché quedó invalidado (move/cierre): el próximo
  // fetch REEMPLAZA en vez de fusionar, y fuerza red aunque las keys "existan".
  const staleRef = useRef(false);
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(false);
  const loadToken = useRef(0);

  const fetchRange = useCallback(
    async (from: Date, to: Date): Promise<ProjectionMatrix | null> => {
      const qs = new URLSearchParams({
        from: from.toISOString(),
        to: to.toISOString(),
        granularity: "weekly",
      });
      const r = await fetch(`/api/finance/cashflow/projection?${qs}`);
      const j = await r.json();
      return j?.success ? (j.data as ProjectionMatrix) : null;
    },
    [],
  );

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
      const token = ++loadToken.current;
      setLoading(true);
      try {
        const next = await fetchRange(firstMissing, endOfIsoWeekUTC(lastMissing));
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
        if (token === loadToken.current) setLoading(false);
      }
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

  return { ensureRange, resolve, invalidate, loading, version };
}
