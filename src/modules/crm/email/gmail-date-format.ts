import { CHILE_TZ, ymdInChile } from "@/lib/dates-cl";

const MONTHS_SHORT = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sept",
  "oct",
  "nov",
  "dic",
] as const;

/**
 * Fecha compacta estilo Gmail, siempre en horario de Chile:
 * hoy → HH:mm; mismo año → d mes; otro año → dd/mm/aa.
 */
export function formatGmailDateChile(
  value: string | Date | null,
  now: Date = new Date(),
): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime()) || Number.isNaN(now.getTime())) return "";

  const dateYmd = ymdInChile(date);
  const nowYmd = ymdInChile(now);
  if (dateYmd === nowYmd) {
    return new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone: CHILE_TZ,
    }).format(date);
  }

  const [year, month, day] = dateYmd.split("-").map(Number);
  const nowYear = Number(nowYmd.slice(0, 4));
  if (year === nowYear) {
    return `${day} ${MONTHS_SHORT[month - 1] ?? ""}`.trim();
  }

  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${String(year).slice(-2)}`;
}
