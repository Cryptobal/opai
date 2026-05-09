import "server-only";
import { getUfValueForDate } from "@/lib/uf";
import { lastDayOfMonth, startOfMonth, subMonths, setDate } from "date-fns";

export async function resolveUfForOccurrence(
  policy: string | null,
  customDay: number | null,
  scheduledDate: Date,
): Promise<number> {
  const p = policy ?? "RUN_DAY";
  let target: Date;
  switch (p) {
    case "LAST_DAY_PREV_MONTH":
      target = lastDayOfMonth(subMonths(scheduledDate, 1));
      break;
    case "FIRST_DAY_MONTH":
      target = startOfMonth(scheduledDate);
      break;
    case "LAST_DAY_MONTH":
      target = lastDayOfMonth(scheduledDate);
      break;
    case "CUSTOM_DAY": {
      const d = customDay ?? 1;
      target = setDate(scheduledDate, Math.min(d, lastDayOfMonth(scheduledDate).getDate()));
      break;
    }
    case "RUN_DAY":
    default:
      target = scheduledDate;
  }
  return getUfValueForDate(target);
}
