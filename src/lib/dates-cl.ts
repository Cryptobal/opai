import { fromZonedTime, toZonedTime } from "date-fns-tz";

export const CHILE_TZ = "America/Santiago";

/**
 * Devuelve la fecha actual en zona horaria America/Santiago como YYYY-MM-DD.
 * Usar esta función SIEMPRE que se quiera el "hoy" del usuario chileno,
 * en vez de new Date() o getUTC*.
 */
export function todayInChile(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: CHILE_TZ });
}

/** YYYY-MM-DD de un instante en America/Santiago. */
export function ymdInChile(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: CHILE_TZ });
}

/** Inicio del día Chile (00:00 America/Santiago) como instante UTC. */
export function startOfDayChile(utcDate: Date = new Date()): Date {
  const local = toZonedTime(utcDate, CHILE_TZ);
  local.setHours(0, 0, 0, 0);
  return fromZonedTime(local, CHILE_TZ);
}

/** Suma días calendario en Chile y devuelve el inicio de ese día (UTC). */
export function addDaysChile(utcDate: Date, days: number): Date {
  const local = toZonedTime(startOfDayChile(utcDate), CHILE_TZ);
  local.setDate(local.getDate() + days);
  local.setHours(0, 0, 0, 0);
  return fromZonedTime(local, CHILE_TZ);
}

/** Días calendario Chile desde `now` hasta `target` (negativo si ya pasó). */
export function chileCalendarDaysUntil(target: Date, now: Date = new Date()): number {
  const a = startOfDayChile(now).getTime();
  const b = startOfDayChile(target).getTime();
  return Math.round((b - a) / 86_400_000);
}

/**
 * Número de semana ISO-8601 (1-53) del día calendario en Chile.
 * Calcula sobre el ymd chileno para que un instante UTC cerca de medianoche
 * no salte de semana respecto a lo que ve el usuario.
 */
export function isoWeekChile(date: Date): number {
  const [y, m, d] = ymdInChile(date).split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1, d));
  const dayNum = (target.getUTCDay() + 6) % 7; // 0 = lunes
  target.setUTCDate(target.getUTCDate() - dayNum + 3); // jueves de esa semana
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  return 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
}

/** Medianoche UTC del YYYY-MM-DD (para comparar columnas @db.Date). */
export function utcDateFromYmd(ymd: string): Date {
  return new Date(`${ymd.slice(0, 10)}T00:00:00.000Z`);
}

/**
 * Devuelve { year, month } actual en Chile (month es 1-12).
 */
export function currentYearMonthInChile(): { year: number; month: number } {
  const dateStr = todayInChile();
  const [y, m] = dateStr.split("-").map(Number);
  return { year: y, month: m };
}

/**
 * Extrae year/month (1-12) de un string de fecha tipo "YYYY-MM-DD..." o ISO.
 * NO usa new Date() para evitar problemas de timezone con campos @db.Date.
 */
export function extractYearMonth(dateStr: string): {
  year: number;
  month: number;
  day: number;
} {
  const slice = dateStr.slice(0, 10);
  const [y, m, d] = slice.split("-").map(Number);
  return { year: y, month: m, day: d };
}
