import type { ProjectionBucket } from "@/modules/finance/cashflow/types";

/**
 * Claves de bucket ISO-semanal en el CLIENTE.
 *
 * `bucketKeyFor` vive en `recurrence-engine.ts`, que es `server-only` (importa
 * `@prisma/client`), así que NO puede importarse en un hook `"use client"`.
 * Replicamos aquí SÓLO la rama weekly sin `weekClosingDow` — que es la que usa
 * `buildProjection` para la grilla (`bucketKeyFor(d, "weekly")`) — en aritmética
 * UTC pura para que sea determinista e independiente del timezone del cliente y
 * coincida con las keys que emite el server.
 *
 * El bucketing sólo depende del día calendario (Y/M/D), no de la hora ni la
 * zona: `getISOWeek`/`getISOWeekYear` (date-fns) sobre `utcCalendarDay(d)` en el
 * server rinden la misma semana ISO que este cálculo UTC para el mismo Y/M/D.
 */

/** Semana ISO (número) del día UTC de `date`, vía el truco del jueves. */
export function isoWeekNumber(date: Date): number {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const day = d.getUTCDay() || 7; // Lun=1 … Dom=7
  d.setUTCDate(d.getUTCDate() + 4 - day); // jueves de la semana
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

/** Key `YYYY-Www` (año-semana ISO) del día UTC de `date`. */
export function weekKey(date: Date): string {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day); // el año ISO lo fija el jueves
  const isoYear = d.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

/** Lunes ISO (00:00 UTC) de la semana de `date`. */
export function startOfIsoWeekUTC(date: Date): Date {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - (day - 1));
  return d;
}

/** Suma `n` semanas (puede ser negativo) en UTC, sin drift por DST. */
export function addWeeksUTC(date: Date, n: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + n * 7);
  return d;
}

/** Domingo ISO (23:59:59.999 UTC) de la semana de `date`. */
export function endOfIsoWeekUTC(date: Date): Date {
  const end = addWeeksUTC(startOfIsoWeekUTC(date), 1);
  end.setUTCMilliseconds(-1);
  return end;
}

/** Slot de columna: key + límites + etiqueta ("Sem NN"), computados en cliente. */
export interface WeekSlot {
  key: string;
  start: Date;
  end: Date;
  label: string;
}

/** `count` slots contiguos desde la semana de `anchor` (incluida) hacia adelante. */
export function weekSlots(anchor: Date, count: number): WeekSlot[] {
  const first = startOfIsoWeekUTC(anchor);
  return Array.from({ length: count }, (_, i) => {
    const start = addWeeksUTC(first, i);
    return {
      key: weekKey(start),
      start,
      end: endOfIsoWeekUTC(start),
      label: `Sem ${isoWeekNumber(start)}`,
    };
  });
}

/** Todas las week keys que cubren `[from, to]` (ambos inclusive, por semana). */
export function weekKeysInRange(from: Date, to: Date): string[] {
  const keys: string[] = [];
  let cur = startOfIsoWeekUTC(from);
  const last = startOfIsoWeekUTC(to);
  while (cur.getTime() <= last.getTime()) {
    keys.push(weekKey(cur));
    cur = addWeeksUTC(cur, 1);
  }
  return keys;
}

/** Bucket vacío (montos en 0) para un slot aún no cacheado. Nunca debería
 *  pintarse (ensureRange corre antes), pero evita un `undefined` que rompa el
 *  render si una key no resolvió. */
export function emptyBucket(slot: WeekSlot): ProjectionBucket {
  return {
    key: slot.key,
    label: slot.label,
    start: slot.start,
    end: slot.end,
    income: 0,
    expense: 0,
    net: 0,
    actualIncome: 0,
    actualExpense: 0,
    varianceClp: 0,
    actualBankIncome: 0,
    actualBankExpense: 0,
    actualBankNet: 0,
    bankVarianceClp: 0,
    occurrences: [],
  };
}
