/**
 * Semanas ISO del Modo Planilla (v3).
 *
 * La celda de plan se indexa por el LUNES ISO de la semana como string
 * `YYYY-MM-DD` (mismo día que persiste FinanceFlowPlanCell.weekStart @db.Date).
 * La aritmética ISO se REUTILIZA de week-keys.ts (v2), que es UTC puro y sin
 * dependencias de server — este archivo tampoco es server-only: lo comparten
 * derivadores (server) y hooks de la grilla (client).
 */
import {
  startOfIsoWeekUTC,
  addWeeksUTC,
  isoWeekNumber,
} from "@/components/finance/cashflow/v2/grid/week-keys";

export { startOfIsoWeekUTC, addWeeksUTC, isoWeekNumber };

/** Semanas máximas que puede pedir una request del matrix (safety clamp). */
export const MAX_RANGE_WEEKS = 120;

/** `YYYY-MM-DD` (UTC) de una fecha. */
export function toYmd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Parsea `YYYY-MM-DD` a Date UTC-medianoche. Inválido → null. */
export function ymdToDate(ymd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Lunes ISO (string YMD) de la semana que contiene `d`. */
export function weekStartYmd(d: Date): string {
  return toYmd(startOfIsoWeekUTC(d));
}

/** ¿El string YMD es exactamente un lunes ISO? */
export function isMondayYmd(ymd: string): boolean {
  const d = ymdToDate(ymd);
  if (!d) return false;
  return toYmd(startOfIsoWeekUTC(d)) === ymd;
}

/**
 * Enumera los lunes ISO desde la semana de `from` hasta la de `to`
 * (ambas inclusive), como strings YMD ordenados asc.
 */
export function enumerateWeeks(from: Date, to: Date): string[] {
  const out: string[] = [];
  let cur = startOfIsoWeekUTC(from);
  const last = startOfIsoWeekUTC(to).getTime();
  let guard = 0;
  while (cur.getTime() <= last && guard < MAX_RANGE_WEEKS * 2) {
    out.push(toYmd(cur));
    cur = addWeeksUTC(cur, 1);
    guard += 1;
  }
  return out;
}

/**
 * Ventana móvil default del matrix: lunes(hoy − 4 semanas) → lunes(hoy + 12
 * meses). Cualquier from/to explícito de la request la sobreescribe.
 */
export function defaultHorizon(today: Date = new Date()): { from: Date; to: Date } {
  const currentMonday = startOfIsoWeekUTC(today);
  const from = addWeeksUTC(currentMonday, -4);
  const plus12m = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 12, today.getUTCDate()),
  );
  return { from, to: startOfIsoWeekUTC(plus12m) };
}

/** Mes calendario (`YYYY-MM`) al que se agrega una semana: el de su lunes. */
export function monthKeyOf(weekYmd: string): string {
  return weekYmd.slice(0, 7);
}

/** Lunes ISO (YMD) de la semana actual. */
export function currentWeekYmd(today: Date = new Date()): string {
  return weekStartYmd(today);
}

/** Etiqueta corta de la semana: "S28". */
export function weekLabel(weekYmd: string): string {
  const d = ymdToDate(weekYmd);
  if (!d) return weekYmd;
  return `S${String(isoWeekNumber(d)).padStart(2, "0")}`;
}
