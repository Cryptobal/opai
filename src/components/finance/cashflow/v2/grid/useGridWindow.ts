"use client";

import { useCallback, useMemo, useState } from "react";
import type { ProjectionMatrix } from "@/modules/finance/cashflow/types";
import { useWeekCache } from "./useWeekCache";
import {
  addWeeksUTC,
  endOfIsoWeekUTC,
  parseWeekKey,
  startOfIsoWeekUTC,
  weekSlots,
} from "./week-keys";

/** Total de columnas (semanas) visibles a la vez en la grilla (desktop). En
 *  móvil la ventana se estrecha a 3 vía la opción `windowWeeks`. */
export const WINDOW_WEEKS = 8;

interface GridWindowOpts {
  /** Semanas hacia atrás desde la semana actual (default 2 en desktop). */
  weeksBack: number;
  /** Ancho de la ventana en semanas (default 8; 3 en móvil). */
  windowWeeks?: number;
  /** Cuántas semanas desplaza cada flecha. Default = `windowWeeks - 1` para
   *  solapar UNA semana entre vistas: la primera columna de la vista nueva es
   *  la última de la anterior, así se puede arrastrar una cuota de una vista a
   *  la siguiente sin que "caiga al vacío". */
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
  // Solape de 1 semana: avanzamos `windowWeeks - 1` para que la última columna
  // de la vista actual reaparezca como primera de la siguiente (y viceversa).
  // Clamp a 1 por si `windowWeeks` fuese 1.
  const step = opts.step ?? Math.max(1, windowWeeks - 1);
  const { ensureRange, resolve, invalidate, invalidateWeeks, loading, version } =
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

  /** Navega para que la semana ISO de `date` sea la PRIMERA columna visible.
   *  Usado por el buscador de folios: al traer/ubicar una factura, saltamos a
   *  su semana. Deja 0 semanas de contexto atrás; suficiente para verla. */
  const goToWeek = useCallback(
    (date: Date) => {
      void goTo(startOfIsoWeekUTC(date));
    },
    [goTo],
  );

  // Tras un cierre/reapertura: invalida TODO y re-trae la ventana actual
  // (preserva ancla). Afecta anclas y candados globales — no usar en move/edit.
  const refresh = useCallback(async () => {
    invalidate();
    await ensureRange(slots[0].start, slots[slots.length - 1].end);
  }, [invalidate, ensureRange, slots]);

  /**
   * Reconciliación selectiva tras mutación: poda solo las semanas afectadas y
   * re-fetchea el rango mínimo que las cubre. Preferimos keys (`YYYY-Www`) porque
   * el caller ya las tiene del move/amount/hide; `parseWeekKey` reconstruye las
   * fechas (menos código que forzar al caller a pasar Dates). Si alguna key no
   * parsea, cae a `refresh()` full.
   */
  const refreshWeeks = useCallback(
    async (keys: string[]) => {
      const unique = [...new Set(keys.filter(Boolean))];
      if (unique.length === 0) return;
      const dates = unique.map(parseWeekKey);
      if (dates.some((d) => d == null)) {
        await refresh();
        return;
      }
      const starts = dates as Date[];
      starts.sort((a, b) => a.getTime() - b.getTime());
      invalidateWeeks(unique);
      await ensureRange(starts[0], endOfIsoWeekUTC(starts[starts.length - 1]));
    },
    [invalidateWeeks, ensureRange, refresh],
  );

  /** Mover-y-mostrar atómico: invalida el caché, re-trae FRESCA la ventana que
   *  arranca en la semana de `date` y ancla ahí. A diferencia de `goToWeek` +
   *  `refresh` (que sufren un race: el refresh re-fetchea la ventana vieja por
   *  closure stale), esto garantiza que la semana destino se ve al instante sin
   *  recargar. Usado por el buscador de folios tras correr una factura. */
  const refreshAt = useCallback(
    async (date: Date) => {
      const anchor = startOfIsoWeekUTC(date);
      const target = weekSlots(anchor, windowWeeks);
      invalidate();
      await ensureRange(target[0].start, target[target.length - 1].end);
      setAnchorDate(anchor);
    },
    [invalidate, ensureRange, windowWeeks],
  );

  return {
    active,
    loading,
    goPrev,
    goNext,
    goToday,
    goToWeek,
    refreshAt,
    refresh,
    refreshWeeks,
  };
}
