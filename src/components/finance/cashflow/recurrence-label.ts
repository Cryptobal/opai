interface ItemLike {
  recurrence: string;
  dayOfMonth: number | null;
  dayOfWeek: number | null;
  monthOfYear: number | null;
}

const DAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MONTHS = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

export function humanReadableRecurrence(item: ItemLike): string {
  switch (item.recurrence) {
    case "ONCE":
      return "Único";
    case "WEEKLY":
      return `Semanal · ${DAYS[item.dayOfWeek ?? 1]}`;
    case "BIWEEKLY":
      return `Quincenal · ${DAYS[item.dayOfWeek ?? 1]}`;
    case "MONTHLY":
      return item.dayOfMonth === -1
        ? "Mensual · último día"
        : `Mensual · día ${item.dayOfMonth ?? 1}`;
    case "QUARTERLY":
      return item.dayOfMonth === -1
        ? "Trimestral · último día"
        : `Trimestral · día ${item.dayOfMonth ?? 1}`;
    case "YEARLY": {
      const m = MONTHS[(item.monthOfYear ?? 1) - 1];
      const d = item.dayOfMonth === -1 ? "último día" : `día ${item.dayOfMonth ?? 1}`;
      return `Anual · ${d} de ${m}`;
    }
    default:
      return item.recurrence;
  }
}
