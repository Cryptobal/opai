import { formatCurrency as formatAppCurrency } from "@/lib/utils";

export const WEEKDAY_ORDER = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export function sortWeekdays(days: string[] = []) {
  const order = new Map(WEEKDAY_ORDER.map((d, i) => [d, i]));
  return [...days].sort((a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99));
}

/** Formato corto para resúmenes: "Lun-Dom", "Lun-Vie", "Vie-Dom", "Lun, Mar, Mié", etc. */
export function formatWeekdaysShort(weekdays: string[] | null | undefined): string {
  if (!weekdays?.length) return "—";
  const sorted = sortWeekdays(weekdays);
  if (sorted.length === 7) return "Lun-Dom";
  if (sorted.length === 5 && sorted[0] === "Lun" && sorted[4] === "Vie") return "Lun-Vie";
  if (sorted.length === 2 && sorted[0] === "Sáb" && sorted[1] === "Dom") return "Sáb-Dom";
  if (sorted.length === 3 && sorted[0] === "Vie" && sorted[2] === "Dom") return "Vie-Dom";
  return sorted.join(", ");
}

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
