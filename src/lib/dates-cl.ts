/**
 * Devuelve la fecha actual en zona horaria America/Santiago como YYYY-MM-DD.
 * Usar esta función SIEMPRE que se quiera el "hoy" del usuario chileno,
 * en vez de new Date() o getUTC*.
 */
export function todayInChile(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date());
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
