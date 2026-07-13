"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addWeeks, subWeeks } from "date-fns";
import { toast } from "sonner";
import type { ProjectionMatrix } from "@/modules/finance/cashflow/types";
import { toDate } from "../format";
import { currentBucketIndex } from "../projection-helpers";

/** Total de columnas (semanas) visibles a la vez en la grilla (desktop). En
 *  móvil la ventana se estrecha a 3 vía la opción `windowWeeks`. */
export const WINDOW_WEEKS = 8;

/** Rango precargado (en UNA sola consulta) alrededor de hoy. Navegar dentro de
 *  este rango es recorte en cliente: instantáneo y siempre consistente (cada
 *  semana se computa una única vez). Solo si el usuario se sale del rango se
 *  pide una extensión. */
const PRELOAD_BACK = 16;
const PRELOAD_FWD = 30;
/** Cuántas semanas extra se traen al llegar a un borde del rango cargado. */
const EXTEND_WEEKS = 16;

interface GridWindowOpts {
  /** Semanas hacia atrás desde la semana foco (default 2 en desktop). */
  weeksBack: number;
  /** Ancho de la ventana en semanas (default 8; 3 en móvil). */
  windowWeeks?: number;
  /** Cuántas semanas desplaza cada flecha (default = windowWeeks). */
  step?: number;
}

function clampStart(len: number, windowWeeks: number, start: number): number {
  return Math.max(0, Math.min(start, Math.max(0, len - windowWeeks)));
}

/**
 * Ventana de semanas sobre una proyección AMPLIA cargada una sola vez.
 *
 * En vez de re-consultar el servidor en cada flecha (lento y, peor aún,
 * inconsistente: la misma semana daba distintos valores porque la proyección se
 * recomputaba con otro rango), se precarga un rango amplio alrededor de hoy y la
 * navegación es puro recorte en cliente (`windowStart` dentro de `full.buckets`).
 * Así:
 *   - navegar es instantáneo (sin red),
 *   - "volver a hoy" es instantáneo,
 *   - cada semana muestra SIEMPRE el mismo valor (se computó una vez).
 * Solo se vuelve a pedir al servidor si el usuario navega fuera del rango
 * cargado (extensión) o tras un move/cierre (`refresh`).
 */
export function useGridWindow(initial: ProjectionMatrix, opts: GridWindowOpts) {
  const windowWeeks = opts.windowWeeks ?? WINDOW_WEEKS;
  const step = opts.step ?? windowWeeks;

  const [full, setFull] = useState<ProjectionMatrix>(initial);
  const [windowStart, setWindowStart] = useState<number>(() =>
    clampStart(
      initial.buckets.length,
      windowWeeks,
      currentBucketIndex(initial.buckets) - opts.weeksBack,
    ),
  );
  const [loading, setLoading] = useState(false);
  const rangeRef = useRef<{ from: Date; to: Date }>({
    from: toDate(initial.range.from),
    to: toDate(initial.range.to),
  });
  const loadToken = useRef(0);
  const preloadedRef = useRef(false);

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

  /** Carga un rango y reposiciona la ventana con `computeStart` (que recibe los
   *  buckets nuevos y devuelve el índice inicial deseado). */
  const loadRange = useCallback(
    async (
      from: Date,
      to: Date,
      computeStart: (buckets: ProjectionMatrix["buckets"]) => number,
    ) => {
      const token = ++loadToken.current;
      setLoading(true);
      try {
        const next = await fetchRange(from, to);
        if (token !== loadToken.current) return;
        if (!next) {
          toast.error("No se pudieron cargar esas semanas");
          return;
        }
        rangeRef.current = { from, to };
        setFull(next);
        setWindowStart(
          clampStart(next.buckets.length, windowWeeks, computeStart(next.buckets)),
        );
      } catch {
        if (token === loadToken.current) {
          toast.error("Error de red al cargar semanas");
        }
      } finally {
        if (token === loadToken.current) setLoading(false);
      }
    },
    [fetchRange, windowWeeks],
  );

  // Precarga amplia UNA vez, tras el primer paint (que ya mostró las 8 semanas
  // del server). A partir de acá la navegación es recorte en cliente.
  useEffect(() => {
    if (preloadedRef.current) return;
    preloadedRef.current = true;
    const today = new Date();
    void loadRange(
      subWeeks(today, PRELOAD_BACK),
      addWeeks(today, PRELOAD_FWD),
      (b) => currentBucketIndex(b) - opts.weeksBack,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ventana visible: recorte de `full.buckets`. Las filas mantienen todos sus
  // valores (la grilla solo lee las bucketKeys visibles).
  const active = useMemo<ProjectionMatrix>(() => {
    const start = clampStart(full.buckets.length, windowWeeks, windowStart);
    return { ...full, buckets: full.buckets.slice(start, start + windowWeeks) };
  }, [full, windowStart, windowWeeks]);

  const goPrev = useCallback(() => {
    const target = windowStart - step;
    if (target >= 0) {
      setWindowStart(target);
      return;
    }
    // Fuera del rango cargado por atrás → extender hacia atrás preservando foco.
    const focusKey = full.buckets[Math.max(0, windowStart)]?.key ?? null;
    void loadRange(
      subWeeks(rangeRef.current.from, EXTEND_WEEKS + step),
      rangeRef.current.to,
      (b) => {
        const i = focusKey ? b.findIndex((x) => x.key === focusKey) : -1;
        return (i >= 0 ? i : opts.weeksBack) - step;
      },
    );
  }, [windowStart, step, full.buckets, loadRange, opts.weeksBack]);

  const goNext = useCallback(() => {
    const maxStart = full.buckets.length - windowWeeks;
    const target = windowStart + step;
    if (target <= maxStart) {
      setWindowStart(target);
      return;
    }
    // Fuera del rango cargado por delante → extender hacia adelante.
    const focusKey = full.buckets[Math.max(0, windowStart)]?.key ?? null;
    void loadRange(
      rangeRef.current.from,
      addWeeks(rangeRef.current.to, EXTEND_WEEKS + step),
      (b) => {
        const i = focusKey ? b.findIndex((x) => x.key === focusKey) : -1;
        return (i >= 0 ? i : currentBucketIndex(b) - opts.weeksBack) + step;
      },
    );
  }, [windowStart, step, full.buckets, windowWeeks, loadRange, opts.weeksBack]);

  // Volver a hoy: recorte instantáneo si hoy está cargado (siempre lo está tras
  // la precarga). Si no, recarga la ventana amplia alrededor de hoy.
  const goToday = useCallback(() => {
    const todayIdx = currentBucketIndex(full.buckets);
    if (todayIdx >= 0) {
      setWindowStart(
        clampStart(full.buckets.length, windowWeeks, todayIdx - opts.weeksBack),
      );
      return;
    }
    const today = new Date();
    void loadRange(
      subWeeks(today, PRELOAD_BACK),
      addWeeks(today, PRELOAD_FWD),
      (b) => currentBucketIndex(b) - opts.weeksBack,
    );
  }, [full.buckets, windowWeeks, opts.weeksBack, loadRange]);

  // Re-trae el rango cargado (tras un move/cierre) preservando el foco visible.
  const refresh = useCallback(async () => {
    const focusKey = active.buckets[0]?.key ?? null;
    await loadRange(rangeRef.current.from, rangeRef.current.to, (b) => {
      const i = focusKey ? b.findIndex((x) => x.key === focusKey) : -1;
      return i >= 0 ? i : currentBucketIndex(b) - opts.weeksBack;
    });
  }, [active.buckets, loadRange, opts.weeksBack]);

  return { active, loading, goPrev, goNext, goToday, refresh };
}
