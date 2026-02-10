const CHILE_TZ = "America/Santiago";

/**
 * Fecha de hoy en zona Chile (America/Santiago).
 * Usa Intl para no depender del timezone del servidor.
 */
export function todayChileStr(): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: CHILE_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value ?? "";
  const m = parts.find((p) => p.type === "month")?.value ?? "";
  const d = parts.find((p) => p.type === "day")?.value ?? "";
  return `${y}-${m}-${d}`;
}

/** Objeto Date para “hoy” en Chile (mediodía para evitar bordes de timezone) */
export function todayChileDate(): Date {
  return new Date(todayChileStr() + "T12:00:00");
}
