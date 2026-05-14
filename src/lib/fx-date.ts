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
  return parseYmdToDbDate(todayChileStr());
}

/**
 * Convierte YYYY-MM-DD a `Date` para columnas `@db.Date` (PostgreSQL) sin corrimientos
 * por timezone: usa mediodía UTC como ancla estable.
 */
export function parseYmdToDbDate(ymd: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) {
    throw new Error(`Fecha inválida (use YYYY-MM-DD): ${ymd}`);
  }
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || mo < 1 || mo > 12 || d < 1 || d > 31) {
    throw new Error(`Fecha inválida: ${ymd}`);
  }
  return new Date(Date.UTC(y, mo - 1, d, 12, 0, 0));
}

/**
 * Formatea una fecha DATE de BD (`@db.Date`) a YYYY-MM-DD usando UTC
 * — coherente con cómo Postgres serializa fechas sin hora en Node.
 */
export function formatDateOnlyUtcYmd(date: Date): string {
  const y = date.getUTCFullYear();
  const mo = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

function getDateOnlyParts(date: Date): { year: number; month: number; day: number } {
  const [year, month, day] = date.toISOString().slice(0, 10).split("-").map(Number);
  return { year, month, day };
}

/**
 * Formatea una fecha DATE de BD (sin timezone real) evitando desfases por zona horaria.
 * Ej: 2026-02-11 -> "11-feb"
 */
export function formatDateOnlyShortEs(date: Date): string {
  const { month, day } = getDateOnlyParts(date);
  const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"];
  return `${String(day).padStart(2, "0")}-${months[Math.max(0, month - 1)]}`;
}

/**
 * Ej: 2026-02-01 -> "febrero 2026"
 */
export function formatDateOnlyMonthYearEs(date: Date): string {
  const { year, month } = getDateOnlyParts(date);
  const months = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  return `${months[Math.max(0, month - 1)]} ${year}`;
}

/**
 * Ej: 2026-02-01 -> "01-feb-2026"
 */
export function formatDateOnlyShortWithYearEs(date: Date): string {
  const { year, month, day } = getDateOnlyParts(date);
  const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"];
  return `${String(day).padStart(2, "0")}-${months[Math.max(0, month - 1)]}-${year}`;
}
