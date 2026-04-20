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
