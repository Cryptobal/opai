/**
 * Weekday helpers — canonical format is the 3-letter abbreviation used by the UI.
 * Adopted 2026-04-10. Legacy rows may store full Spanish names ("lunes", ...) from
 * the previous service-template seeds; `normalizeWeekdays` maps them forward.
 */

export const WEEKDAY_ORDER = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"] as const;
export type Weekday = (typeof WEEKDAY_ORDER)[number];

const LEGACY_TO_SHORT: Record<string, Weekday> = {
  lunes: "Lun",
  martes: "Mar",
  miercoles: "Mié",
  "miércoles": "Mié",
  jueves: "Jue",
  viernes: "Vie",
  sabado: "Sáb",
  "sábado": "Sáb",
  domingo: "Dom",
};

const SHORT_TO_LONG: Record<Weekday, string> = {
  Lun: "lunes",
  Mar: "martes",
  "Mié": "miércoles",
  Jue: "jueves",
  Vie: "viernes",
  "Sáb": "sábado",
  Dom: "domingo",
};

export function sortWeekdays(days: readonly string[] = []): Weekday[] {
  const order = new Map(WEEKDAY_ORDER.map((d, i) => [d, i] as const));
  const normalized = normalizeWeekdays(days);
  return [...normalized].sort((a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99));
}

/**
 * Map any mix of legacy (full Spanish) or short weekday strings to the canonical
 * short form, deduplicated. Unknown tokens are dropped.
 */
export function normalizeWeekdays(days: readonly string[] | null | undefined): Weekday[] {
  if (!days?.length) return [];
  const seen = new Set<Weekday>();
  const out: Weekday[] = [];
  for (const raw of days) {
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const short = (WEEKDAY_ORDER as readonly string[]).includes(trimmed)
      ? (trimmed as Weekday)
      : LEGACY_TO_SHORT[trimmed.toLowerCase()];
    if (short && !seen.has(short)) {
      seen.add(short);
      out.push(short);
    }
  }
  return out;
}

/** Compact summary used in badges/chips: "Lun-Dom", "Lun-Vie", "Sáb-Dom", etc. */
export function formatWeekdaysShort(weekdays: readonly string[] | null | undefined): string {
  const sorted = sortWeekdays(weekdays ?? []);
  if (!sorted.length) return "—";
  if (sorted.length === 7) return "Lun-Dom";
  if (sorted.length === 5 && sorted[0] === "Lun" && sorted[4] === "Vie") return "Lun-Vie";
  if (sorted.length === 2 && sorted[0] === "Sáb" && sorted[1] === "Dom") return "Sáb-Dom";
  if (sorted.length === 3 && sorted[0] === "Vie" && sorted[2] === "Dom") return "Vie-Dom";
  return sorted.join(", ");
}

/**
 * Human-friendly Spanish phrase for use in PDFs and AI prompts.
 * Examples: "todos los días", "de lunes a viernes", "sábado y domingo",
 * "lunes, miércoles y viernes".
 */
export function formatWeekdaysLong(weekdays: readonly string[] | null | undefined): string {
  const sorted = sortWeekdays(weekdays ?? []);
  if (!sorted.length) return "—";
  if (sorted.length === 7) return "todos los días";
  if (sorted.length === 5 && sorted[0] === "Lun" && sorted[4] === "Vie") return "de lunes a viernes";
  if (sorted.length === 2 && sorted[0] === "Sáb" && sorted[1] === "Dom") return "sábado y domingo";
  if (sorted.length === 3 && sorted[0] === "Vie" && sorted[2] === "Dom") return "de viernes a domingo";

  const longs = sorted.map((d) => SHORT_TO_LONG[d]);
  if (longs.length === 1) return longs[0];
  return `${longs.slice(0, -1).join(", ")} y ${longs[longs.length - 1]}`;
}

/* ── Cobertura horaria (multi-turno) ───────────────────────────── */

export interface CoverageShift {
  startTime: string | null;
  endTime: string | null;
  weekdays: readonly string[] | string | null;
}

/** Convierte "HH:MM" a minutos desde medianoche. Devuelve null si no parsea. */
function toMinutes(t: string | null | undefined): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Determina si el conjunto de turnos cubre el día completo (24h) sin huecos,
 * considerando turnos que cruzan medianoche (ej: 20:00-08:00).
 * Solo evalúa turnos que operan todos los días (cobertura continua real).
 */
export function coversFullDay(shifts: readonly CoverageShift[]): boolean {
  const dailyShifts = shifts.filter((s) => {
    const wd = sortWeekdays(
      Array.isArray(s.weekdays) ? s.weekdays : s.weekdays ? [s.weekdays] : [],
    );
    return wd.length === 7;
  });
  if (dailyShifts.length === 0) return false;

  // Construye intervalos [start, end) en una línea de 0..1440; los que cruzan
  // medianoche se parten en dos.
  const intervals: Array<[number, number]> = [];
  for (const s of dailyShifts) {
    const start = toMinutes(s.startTime);
    let end = toMinutes(s.endTime);
    if (start === null || end === null) return false;
    if (end === start) return true; // turno de 24h declarado como 08:00-08:00
    if (end < start) {
      intervals.push([start, 1440]);
      intervals.push([0, end]);
    } else {
      intervals.push([start, end]);
    }
  }

  // Ordena y verifica cobertura continua de 0 a 1440 sin huecos.
  intervals.sort((a, b) => a[0] - b[0]);
  let cursor = 0;
  for (const [start, end] of intervals) {
    if (start > cursor) return false; // hueco
    cursor = Math.max(cursor, end);
    if (cursor >= 1440) return true;
  }
  return cursor >= 1440;
}

/**
 * Frase de cobertura para PDF y prompt de IA, uniendo todos los turnos.
 * - Si cubren el día completo todos los días → "24/7 continuo".
 * - Si no, lista los turnos: "08:00-20:00 y 20:00-08:00, todos los días".
 */
export function formatCoverageSchedule(shifts: readonly CoverageShift[]): string {
  if (!shifts.length) return "A definir";

  if (coversFullDay(shifts)) return "24/7 continuo, todos los días";

  // Días: si todos los turnos comparten el mismo set, lo mencionamos una vez.
  const dayPhrases = new Set(
    shifts.map((s) =>
      formatWeekdaysLong(
        Array.isArray(s.weekdays) ? s.weekdays : s.weekdays ? [s.weekdays] : [],
      ),
    ),
  );

  const ranges = shifts
    .map((s) => `${s.startTime || "—"}-${s.endTime || "—"}`)
    .filter((r) => r !== "—-—");

  const uniqueRanges = Array.from(new Set(ranges));
  const rangePhrase =
    uniqueRanges.length <= 1
      ? uniqueRanges[0] ?? "horario a definir"
      : `${uniqueRanges.slice(0, -1).join(", ")} y ${uniqueRanges[uniqueRanges.length - 1]}`;

  if (dayPhrases.size === 1) {
    return `${rangePhrase}, ${[...dayPhrases][0]}`;
  }
  return rangePhrase;
}
