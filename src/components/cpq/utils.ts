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
