"use client";

import { useCallback, useMemo, useState } from "react";
import type { ProjectionMatrix } from "@/modules/finance/cashflow/types";
import { useWeekCache } from "./useWeekCache";
import { addWeeksUTC, startOfIsoWeekUTC, weekSlots } from "./week-keys";

/** Total de columnas (semanas) visibles a la vez en la grilla (desktop). En
 *  móvil la ventana se estrecha a 3 vía la opción `windowWeeks`. */
export const WINDOW_WEEKS = 8;

interface GridWindowOpts {
  /** Semanas hacia atrás desde la semana actual (default 2 en desktop). */
  weeksBack: number;
  /** Ancho de la ventana en semanas (default 8; 3 en móvil). */
  windowWeeks?: number;
  /** Cuántas semanas desplaza cada flecha (default = windowWeeks). */
  step?: number;
}

/** Ancla inicial = lunes ISO de hoy, corrido `weeksBack` semanas hacia atrás. */
function initialAnchor(weeksBack: number): Date {
  return addWeeksUTC(startOfIsoWeekUTC(new Date()), -weeksBack);
}

/**
 * Ventana de semanas sobre un caché por `bucketKey` (`useWeekCache`).
 *
 * El estado de navegación es UN ANCLA DE FECHA (la primera columna visible), no
 * un índice sobre un array volátil: al llegar datos nuevos el índice apuntaba a
 * otra semana y la ventana "saltaba". Con un ancla estable, navegar es:
 *   1. garantizar en caché las semanas de la ventana destino (`ensureRange`),
 *   2. recién entonces mover el ancla.
 * Mientras corre (1) `loading` es `true` → las flechas quedan deshabilitadas y
 * no puede haber un clic a medio camino. Navegar a algo ya cacheado no pide red
 * (instantáneo) y siempre muestra los mismos montos por semana.
 */
export function useGridWindow(initial: ProjectionMatrix, opts: GridWindowOpts) {
  const windowWeeks = opts.windowWeeks ?? WINDOW_WEEKS;
  const step = opts.step ?? windowWeeks;
  const { ensureRange, resolve, invalidate, loading, version } =
    useWeekCache(initial);

  const [anchorDate, setAnchorDate] = useState<Date>(() =>
    initialAnchor(opts.weeksBack),
  );

  const slots = useMemo(
    () => weekSlots(anchorDate, windowWeeks),
    [anchorDate, windowWeeks],
  );

  // Ventana visible: las `windowWeeks` keys desde el ancla resueltas contra el
  // caché. `version` la recomputa cuando llega un fetch nuevo.
  const active = useMemo<ProjectionMatrix>(
    () => resolve(slots),
    [resolve, slots, version],
  );

  // Primero garantiza los datos, después mueve la ventana (nunca al revés).
  const goTo = useCallback(
    async (nextAnchor: Date) => {
      const target = weekSlots(nextAnchor, windowWeeks);
      await ensureRange(target[0].start, target[target.length - 1].end);
      setAnchorDate(nextAnchor);
    },
    [ensureRange, windowWeeks],
  );

  const goPrev = useCallback(() => {
    void goTo(addWeeksUTC(anchorDate, -step));
  }, [goTo, anchorDate, step]);

  const goNext = useCallback(() => {
    void goTo(addWeeksUTC(anchorDate, step));
  }, [goTo, anchorDate, step]);

  const goToday = useCallback(() => {
    void goTo(initialAnchor(opts.weeksBack));
  }, [goTo, opts.weeksBack]);

  // Tras un move/cierre: invalida y re-trae la ventana actual (preserva ancla).
  const refresh = useCallback(async () => {
    invalidate();
    await ensureRange(slots[0].start, slots[slots.length - 1].end);
  }, [invalidate, ensureRange, slots]);

  return { active, loading, goPrev, goNext, goToday, refresh };
}
