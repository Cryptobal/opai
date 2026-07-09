"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { addWeeks, subWeeks } from "date-fns";
import { toast } from "sonner";
import type { ProjectionMatrix } from "@/modules/finance/cashflow/types";
import { toDate } from "../format";

/** Total de columnas (semanas) visibles a la vez en la grilla. */
export const WINDOW_WEEKS = 8;

/**
 * Ventana de 8 semanas con navegación por bloques. Arranca desde la
 * proyección que el server ya calculó (8 semanas: `weeksBack` atrás + hoy +
 * resto adelante) y trae bloques contiguos bajo demanda vía el endpoint
 * `GET /api/finance/cashflow/projection` (mismo patrón `fetchWeeklyRange` que
 * `CashflowV2Shell`). Cada bloque es una proyección auto-consistente (opening,
 * cumulativos y anchor recalculados para su rango), así que solo reemplazamos
 * la matriz visible — no acumulamos semanas en memoria.
 */
export function useGridWindow(
  initial: ProjectionMatrix,
  opts: { weeksBack: number },
) {
  const [active, setActive] = useState<ProjectionMatrix>(initial);
  const [loading, setLoading] = useState(false);
  // Rango actualmente en pantalla (ISO). Arranca en el rango de la proyección
  // inicial del server. Se mueve en bloques de WINDOW_WEEKS.
  const rangeRef = useRef<{ from: Date; to: Date }>({
    from: toDate(initial.range.from),
    to: toDate(initial.range.to),
  });

  // Si el server refresca la proyección inicial (router.refresh tras un move o
  // cierre) y estamos parados en el bloque "hoy", adoptamos la nueva matriz.
  useEffect(() => {
    const r = rangeRef.current;
    const initFrom = toDate(initial.range.from).getTime();
    const initTo = toDate(initial.range.to).getTime();
    if (r.from.getTime() === initFrom && r.to.getTime() === initTo) {
      setActive(initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

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

  const load = useCallback(
    async (from: Date, to: Date) => {
      setLoading(true);
      try {
        const next = await fetchRange(from, to);
        if (!next) {
          toast.error("No se pudieron cargar esas semanas");
          return;
        }
        rangeRef.current = { from, to };
        setActive(next);
      } catch {
        toast.error("Error de red al cargar semanas");
      } finally {
        setLoading(false);
      }
    },
    [fetchRange],
  );

  const goPrev = useCallback(() => {
    const { from, to } = rangeRef.current;
    void load(subWeeks(from, WINDOW_WEEKS), subWeeks(to, WINDOW_WEEKS));
  }, [load]);

  const goNext = useCallback(() => {
    const { from, to } = rangeRef.current;
    void load(addWeeks(from, WINDOW_WEEKS), addWeeks(to, WINDOW_WEEKS));
  }, [load]);

  // Vuelve al bloque "hoy" (mismo encuadre que el primer render del server).
  const goToday = useCallback(() => {
    const today = new Date();
    void load(
      subWeeks(today, opts.weeksBack),
      addWeeks(today, WINDOW_WEEKS - opts.weeksBack),
    );
  }, [load, opts.weeksBack]);

  // Re-trae el rango en pantalla (tras un move/cierre en un bloque histórico).
  const refresh = useCallback(async () => {
    const { from, to } = rangeRef.current;
    const next = await fetchRange(from, to);
    if (next) setActive(next);
  }, [fetchRange]);

  return { active, loading, goPrev, goNext, goToday, refresh };
}
