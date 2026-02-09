import { formatCurrency as formatAppCurrency } from "@/lib/utils";

export const WEEKDAY_ORDER = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export function sortWeekdays(days: string[] = []) {
  const order = new Map(WEEKDAY_ORDER.map((d, i) => [d, i]));
  return [...days].sort((a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99));
}

export function formatCurrency(value: number) {
  return formatAppCurrency(value, "CLP");
}
