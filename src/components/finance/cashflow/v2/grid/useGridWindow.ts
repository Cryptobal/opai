"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { addWeeks, subWeeks } from "date-fns";
import { toast } from "sonner";
import type { ProjectionMatrix } from "@/modules/finance/cashflow/types";
import { toDate } from "../format";

/** Total de columnas (semanas) visibles a la vez en la grilla (desktop). En
 *  móvil la ventana se estrecha a 3 (anterior · actual · siguiente) vía la
 *  opción `windowWeeks`. */
export const WINDOW_WEEKS = 8;

interface GridWindowOpts {
  /** Semanas hacia atrás desde la semana foco (default 2 en desktop). */
  weeksBack: number;
  /** Ancho de la ventana en semanas (default 8; 3 en móvil). */
  windowWeeks?: number;
  /** Cuántas semanas desplaza cada flecha (default = windowWeeks: navegación por
   *  bloque en desktop; 1 en móvil para moverse de a una semana). */
  step?: number;
}

/**
 * Ventana de semanas con navegación centrada en una semana foco. Arranca desde
 * la proyección que el server ya calculó (8 semanas: `weeksBack` atrás + hoy +
 * resto adelante) y trae ventanas contiguas bajo demanda vía el endpoint
 * `GET /api/finance/cashflow/projection` (mismo patrón `fetchWeeklyRange` que
 * `CashflowV2Shell`). Cada ventana es una proyección auto-consistente (opening,
 * cumulativos y anchor recalculados para su rango), así que solo reemplazamos
 * la matriz visible — no acumulamos semanas en memoria.
 *
 * La navegación mueve la semana foco `step` semanas y recarga una ventana de
 * ancho fijo `windowWeeks` alrededor de ella. En desktop (windowWeeks=8,
 * step=8) reproduce la navegación por bloques original; en móvil
 * (windowWeeks=3, step=1) desliza de a una semana manteniendo el ancho de 3.
 */
export function useGridWindow(
  initial: ProjectionMatrix,
  opts: GridWindowOpts,
) {
  const windowWeeks = opts.windowWeeks ?? WINDOW_WEEKS;
  const step = opts.step ?? windowWeeks;
  const [active, setActive] = useState<ProjectionMatrix>(initial);
  const [loading, setLoading] = useState(false);
  // Rango actualmente en pantalla (ISO). Arranca en el rango de la proyección
  // inicial del server.
  const rangeRef = useRef<{ from: Date; to: Date }>({
    from: toDate(initial.range.from),
    to: toDate(initial.range.to),
  });
  // Semana foco de la ventana: la navegación la mueve y recarga alrededor.
  const focusRef = useRef<Date>(new Date());
  // Token para invalidar cargas en vuelo: si el usuario pulsa "Hoy" mientras
  // una navegación previa aún está buscando, esa respuesta tardía no debe
  // pisar la matriz restaurada.
  const loadToken = useRef(0);

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
      const token = ++loadToken.current;
      setLoading(true);
      try {
        const next = await fetchRange(from, to);
        if (token !== loadToken.current) return; // superada por otra acción
        if (!next) {
          toast.error("No se pudieron cargar esas semanas");
          return;
        }
        rangeRef.current = { from, to };
        setActive(next);
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

  // Recarga una ventana de ancho `windowWeeks` centrada (según weeksBack) en la
  // semana foco dada.
  const loadFocus = useCallback(
    (focus: Date) => {
      focusRef.current = focus;
      void load(
        subWeeks(focus, opts.weeksBack),
        addWeeks(focus, windowWeeks - opts.weeksBack),
      );
    },
    [load, opts.weeksBack, windowWeeks],
  );

  const goPrev = useCallback(() => {
    loadFocus(subWeeks(focusRef.current, step));
  }, [loadFocus, step]);

  const goNext = useCallback(() => {
    loadFocus(addWeeks(focusRef.current, step));
  }, [loadFocus, step]);

  // Vuelve a la ventana "hoy". Restaura la matriz que el server ya calculó en
  // el primer render (autoridad para "hoy"): es instantáneo (sin red, sin lag)
  // y garantiza que los números coincidan EXACTAMENTE con la carga inicial. El
  // re-fetch anterior pedía una ventana basada en `new Date()` sin alinear a la
  // semana del server, así que "volver a hoy" mostraba valores levemente
  // distintos y a veces parecía quedarse pegado.
  const goToday = useCallback(() => {
    loadToken.current++; // invalida cualquier carga en vuelo
    rangeRef.current = {
      from: toDate(initial.range.from),
      to: toDate(initial.range.to),
    };
    focusRef.current = new Date();
    setActive(initial);
    setLoading(false);
  }, [initial]);

  // Re-trae el rango en pantalla (tras un move/cierre en un bloque histórico).
  const refresh = useCallback(async () => {
    const { from, to } = rangeRef.current;
    const next = await fetchRange(from, to);
    if (next) setActive(next);
  }, [fetchRange]);

  return { active, loading, goPrev, goNext, goToday, refresh };
}
