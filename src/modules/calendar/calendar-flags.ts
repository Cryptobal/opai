/**
 * Feature flag Calendar v2 (doble escritura AgendaVisita → CalendarEvent).
 *
 * - `CALENDAR_V2=1` fuerza on, `CALENDAR_V2=0` fuerza off.
 * - Sin definir: on fuera de producción (preview/dev), off en producción.
 */
export function isCalendarV2Enabled(): boolean {
  const flag = process.env.CALENDAR_V2;
  if (flag === "0" || flag === "false") return false;
  if (flag === "1" || flag === "true") return true;
  return process.env.VERCEL_ENV !== "production";
}
