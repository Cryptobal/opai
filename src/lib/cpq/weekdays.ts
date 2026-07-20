/**
 * Weekday helpers — canonical format is the 3-letter abbreviation used by the UI.
 * Adopted 2026-04-10. Legacy rows may store full Spanish names ("lunes", ...) from
 * the previous service-template seeds; `normalizeWeekdays` maps them forward.
 *
 * El token `Fer` marca cobertura de festivos (comercial). No es un día de semana
 * real: no cuenta para horas/jornada ni para coversFullDay.
 */

export const WEEKDAY_ORDER = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"] as const;
export type Weekday = (typeof WEEKDAY_ORDER)[number];

export const HOLIDAY_DAY = "Fer" as const;
export type ExtendedDay = Weekday | typeof HOLIDAY_DAY;
export const DAY_ORDER_WITH_HOLIDAY = [...WEEKDAY_ORDER, HOLIDAY_DAY] as const;

const HOLIDAY_ALIASES = new Set([
  "fer",
  "f",
  "feriado",
  "feriados",
  "festivo",
  "festivos",
]);

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

/** Filtra el token de festivos; devuelve solo días reales de semana. */
export function onlyRealWeekdays(days: readonly string[] | null | undefined): Weekday[] {
  if (!days?.length) return [];
  return days.filter((d): d is Weekday =>
    (WEEKDAY_ORDER as readonly string[]).includes(d),
  );
}

/** true si el arreglo incluye el marcador de festivos. */
export function includesHoliday(days: readonly string[] | null | undefined): boolean {
  if (!days?.length) return false;
  return days.some((d) => typeof d === "string" && HOLIDAY_ALIASES.has(d.trim().toLowerCase()));
}

/**
 * Map any mix of legacy (full Spanish) or short weekday strings to the canonical
 * short form, deduplicated. Holiday aliases normalize to `Fer` (always last).
 * Unknown tokens are dropped.
 */
export function normalizeWeekdays(days: readonly string[] | null | undefined): ExtendedDay[] {
  if (!days?.length) return [];
  const seen = new Set<Weekday>();
  const out: Weekday[] = [];
  let hasHoliday = false;
  for (const raw of days) {
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (HOLIDAY_ALIASES.has(trimmed.toLowerCase())) {
      hasHoliday = true;
      continue;
    }
    const short = (WEEKDAY_ORDER as readonly string[]).includes(trimmed)
      ? (trimmed as Weekday)
      : LEGACY_TO_SHORT[trimmed.toLowerCase()];
    if (short && !seen.has(short)) {
      seen.add(short);
      out.push(short);
    }
  }
  return hasHoliday ? [...out, HOLIDAY_DAY] : out;
}

export function sortWeekdays(days: readonly string[] = []): ExtendedDay[] {
  const order = new Map(DAY_ORDER_WITH_HOLIDAY.map((d, i) => [d, i] as const));
  const normalized = normalizeWeekdays(days);
  return [...normalized].sort((a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99));
}

/** Compact summary used in badges/chips: "Lun-Dom", "Lun-Vie +F", etc. */
export function formatWeekdaysShort(weekdays: readonly string[] | null | undefined): string {
  const real = onlyRealWeekdays(sortWeekdays(weekdays ?? []));
  const holiday = includesHoliday(weekdays);
  const suffix = holiday ? " +F" : "";
  if (!real.length) return holiday ? "F" : "—";
  let base: string;
  if (real.length === 7) base = "Lun-Dom";
  else if (real.length === 5 && real[0] === "Lun" && real[4] === "Vie") base = "Lun-Vie";
  else if (real.length === 2 && real[0] === "Sáb" && real[1] === "Dom") base = "Sáb-Dom";
  else if (real.length === 3 && real[0] === "Vie" && real[2] === "Dom") base = "Vie-Dom";
  else base = real.join(", ");
  return `${base}${suffix}`;
}

/**
 * Human-friendly Spanish phrase for use in PDFs and AI prompts.
 * Examples: "todos los días", "de lunes a viernes y festivos".
 */
export function formatWeekdaysLong(weekdays: readonly string[] | null | undefined): string {
  const real = onlyRealWeekdays(sortWeekdays(weekdays ?? []));
  const holiday = includesHoliday(weekdays);
  const suffix = holiday ? " y festivos" : "";
  if (!real.length) return holiday ? "festivos" : "—";
  let base: string;
  if (real.length === 7) base = "todos los días";
  else if (real.length === 5 && real[0] === "Lun" && real[4] === "Vie") base = "de lunes a viernes";
  else if (real.length === 2 && real[0] === "Sáb" && real[1] === "Dom") base = "sábado y domingo";
  else if (real.length === 3 && real[0] === "Vie" && real[2] === "Dom") base = "de viernes a domingo";
  else {
    const longs = real.map((d) => SHORT_TO_LONG[d]);
    if (longs.length === 1) base = longs[0];
    else base = `${longs.slice(0, -1).join(", ")} y ${longs[longs.length - 1]}`;
  }
  return `${base}${suffix}`;
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
    const wd = onlyRealWeekdays(
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
