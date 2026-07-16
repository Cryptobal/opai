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
  /** Cuántas semanas desplaza cada flecha. Default = `windowWeeks - 1`
   *  (solape histórico). F3 desktop pasa `step: 1`. */
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
 * un índice sobre un array volátil.
 *
 * Contrato F3: `goTo` mueve el ancla **inmediato** y dispara `ensureRange` en
 * background. `resolve` rellena keys faltantes con `emptyBucket`; las columnas
 * pendientes se exponen en `pendingKeys` para skeleton. Es seguro porque el
 * ancla es fecha estable (el bug histórico de índice volátil ya no aplica).
 */
export function useGridWindow(initial: ProjectionMatrix, opts: GridWindowOpts) {
  const windowWeeks = opts.windowWeeks ?? WINDOW_WEEKS;
  const step = opts.step ?? Math.max(1, windowWeeks - 1);
  const {
    ensureRange,
    resolve,
    invalidate,
    invalidateWeeks,
    loading,
    version,
    presentKeys,
  } = useWeekCache(initial);

  const [anchorDate, setAnchorDate] = useState<Date>(() =>
    initialAnchor(opts.weeksBack),
  );

  const slots = useMemo(
    () => weekSlots(anchorDate, windowWeeks),
    [anchorDate, windowWeeks],
  );

  const active = useMemo<ProjectionMatrix>(
    () => resolve(slots),
    [resolve, slots, version],
  );

  /** Keys de la ventana visible aún no presentes en el caché. */
  const pendingKeys = useMemo(() => {
    const pending = new Set<string>();
    for (const s of slots) {
      if (!presentKeys.has(s.key)) pending.add(s.key);
    }
    return pending;
  }, [slots, presentKeys]);

  // Ancla primero → UI inmediata; fetch después (skeleton en pendingKeys).
  const goTo = useCallback(
    (nextAnchor: Date) => {
      setAnchorDate(nextAnchor);
      const target = weekSlots(nextAnchor, windowWeeks);
      void ensureRange(target[0].start, target[target.length - 1].end);
    },
    [ensureRange, windowWeeks],
  );

  const goPrev = useCallback(() => {
    goTo(addWeeksUTC(anchorDate, -step));
  }, [goTo, anchorDate, step]);

  const goNext = useCallback(() => {
    goTo(addWeeksUTC(anchorDate, step));
  }, [goTo, anchorDate, step]);

  const goToday = useCallback(() => {
    goTo(initialAnchor(opts.weeksBack));
  }, [goTo, opts.weeksBack]);

  /** Navega para que la semana ISO de `date` sea la PRIMERA columna visible. */
  const goToWeek = useCallback(
    (date: Date) => {
      goTo(startOfIsoWeekUTC(date));
    },
    [goTo],
  );

  const refresh = useCallback(async () => {
    invalidate();
    await ensureRange(slots[0].start, slots[slots.length - 1].end);
  }, [invalidate, ensureRange, slots]);

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
    pendingKeys,
    goPrev,
    goNext,
    goToday,
    goToWeek,
    refreshAt,
    refresh,
    refreshWeeks,
    ensureRange,
    anchorDate,
    windowWeeks,
  };
}
