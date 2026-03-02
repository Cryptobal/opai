import { toZonedTime, fromZonedTime } from "date-fns-tz";

/**
 * Default timezone for all ronda operations.
 * Chile Continental: America/Santiago (CLT UTC-4 / CLST UTC-3)
 */
export const CHILE_TZ = "America/Santiago";

/**
 * Convert a UTC Date to Chile local time.
 * Use this when you need to check what day/hour it is in Chile.
 */
export function toChileTime(utcDate: Date): Date {
  return toZonedTime(utcDate, CHILE_TZ);
}

/**
 * Convert a Chile local time to UTC.
 * Use this when storing dates that were entered as local Chilean times.
 */
export function fromChileTime(localDate: Date): Date {
  return fromZonedTime(localDate, CHILE_TZ);
}

/**
 * Get start of day in Chile timezone, returned as UTC.
 * Example: 2026-03-02 00:00:00 Chile time -> 2026-03-02T03:00:00Z (CLT) or T04:00:00Z (CLST)
 */
export function startOfDayChile(utcDate: Date): Date {
  const local = toChileTime(utcDate);
  local.setHours(0, 0, 0, 0);
  return fromChileTime(local);
}

/**
 * Get end of day in Chile timezone, returned as UTC.
 */
export function endOfDayChile(utcDate: Date): Date {
  const local = toChileTime(utcDate);
  local.setHours(23, 59, 59, 999);
  return fromChileTime(local);
}

/**
 * Get the day-of-week (0=Sun, 6=Sat) for a UTC date in Chile timezone.
 */
export function getChileDayOfWeek(utcDate: Date): number {
  return toChileTime(utcDate).getDay();
}

/**
 * Parse "HH:mm" string as Chile local time on a given UTC date, return UTC.
 * Example: parseChileHour("08:00", someUtcDate) returns 08:00 Chile time as UTC.
 */
export function parseChileHour(timeStr: string, utcDate: Date): Date {
  const [h, m] = timeStr.split(":").map(Number);
  const local = toChileTime(utcDate);
  local.setHours(h, m, 0, 0);
  return fromChileTime(local);
}

/**
 * Format a UTC date to Chilean local time string "HH:mm".
 */
export function formatChileTime(utcDate: Date): string {
  const local = toChileTime(utcDate);
  return `${String(local.getHours()).padStart(2, "0")}:${String(local.getMinutes()).padStart(2, "0")}`;
}
