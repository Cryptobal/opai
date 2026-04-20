import { formatCurrency as formatAppCurrency } from "@/lib/utils";

export {
  WEEKDAY_ORDER,
  sortWeekdays,
  normalizeWeekdays,
  formatWeekdaysShort,
  formatWeekdaysLong,
} from "@/lib/cpq/weekdays";
export type { Weekday } from "@/lib/cpq/weekdays";

export function formatCurrency(value: number) {
  return formatAppCurrency(value, "CLP");
}

/**
 * Determina si un turno es diurno o nocturno basado en la hora de inicio.
 * Turno nocturno: inicio entre 18:00 y 05:59 (inclusive).
 * Turno diurno: inicio entre 06:00 y 17:59.
 */
export function getShiftType(startTime: string | null | undefined): "day" | "night" {
  if (!startTime) return "day";
  const [hStr] = startTime.split(":");
  const hour = parseInt(hStr, 10);
  if (isNaN(hour)) return "day";
  return hour >= 18 || hour < 6 ? "night" : "day";
}

/** Etiqueta legible del turno */
export function getShiftLabel(startTime: string | null | undefined): string {
  return getShiftType(startTime) === "night" ? "Nocturno" : "Diurno";
}
