import "server-only";
import type { FinanceCashflowItem, FinanceCashflowRecurrence } from "@prisma/client";
import {
  addDays, addWeeks, addMonths,
  startOfDay, endOfDay,
  getDay, getDate, getMonth, getYear,
  setDate, lastDayOfMonth, isBefore, isAfter,
  getISOWeek, getISOWeekYear,
  startOfISOWeek, endOfISOWeek, startOfMonth, endOfMonth,
} from "date-fns";

export function expandRecurrence(
  item: Pick<FinanceCashflowItem, "recurrence" | "startDate" | "endDate" | "dayOfMonth" | "dayOfWeek" | "monthOfYear">,
  from: Date,
  to: Date,
): Date[] {
  const start = startOfDay(item.startDate);
  const end = item.endDate ? endOfDay(item.endDate) : null;
  const rangeStart = startOfDay(from);
  const rangeEnd = endOfDay(to);

  const dates: Date[] = [];
  const push = (d: Date) => {
    if (isBefore(d, rangeStart)) return;
    if (isAfter(d, rangeEnd)) return;
    if (isBefore(d, start)) return;
    if (end && isAfter(d, end)) return;
    dates.push(startOfDay(d));
  };

  switch (item.recurrence as FinanceCashflowRecurrence) {
    case "ONCE": {
      push(start);
      break;
    }
    case "WEEKLY":
    case "BIWEEKLY": {
      const stepWeeks = item.recurrence === "BIWEEKLY" ? 2 : 1;
      const targetDow = item.dayOfWeek ?? getDay(start);
      let cursor = start;
      const startDow = getDay(cursor);
      const offset = (targetDow - startDow + 7) % 7;
      cursor = addDays(cursor, offset);
      while (!isAfter(cursor, rangeEnd)) {
        push(cursor);
        cursor = addWeeks(cursor, stepWeeks);
      }
      break;
    }
    case "MONTHLY":
    case "QUARTERLY":
    case "YEARLY": {
      const stepMonths = item.recurrence === "MONTHLY" ? 1 : item.recurrence === "QUARTERLY" ? 3 : 12;
      const dom = item.dayOfMonth ?? getDate(start);
      const targetMonth = item.recurrence === "YEARLY" ? (item.monthOfYear ?? getMonth(start) + 1) : null;

      let cursor = start;
      while (!isAfter(cursor, rangeEnd)) {
        let d: Date;
        if (item.recurrence === "YEARLY" && targetMonth) {
          d = new Date(getYear(cursor), targetMonth - 1, 1);
        } else {
          d = new Date(getYear(cursor), getMonth(cursor), 1);
        }
        if (dom === -1) {
          d = lastDayOfMonth(d);
        } else {
          const last = lastDayOfMonth(d);
          d = setDate(d, Math.min(dom, getDate(last)));
        }
        push(d);
        cursor = addMonths(cursor, stepMonths);
      }
      break;
    }
  }

  const uniq = Array.from(new Set(dates.map((d) => d.toISOString())))
    .map((s) => new Date(s))
    .sort((a, b) => a.getTime() - b.getTime());
  return uniq;
}

export function bucketKeyFor(date: Date, granularity: "weekly" | "monthly"): string {
  if (granularity === "weekly") {
    const w = String(getISOWeek(date)).padStart(2, "0");
    return `${getISOWeekYear(date)}-W${w}`;
  }
  const m = String(getMonth(date) + 1).padStart(2, "0");
  return `${getYear(date)}-${m}`;
}

export function bucketBoundsFor(
  date: Date,
  granularity: "weekly" | "monthly",
): { start: Date; end: Date; label: string } {
  if (granularity === "weekly") {
    const start = startOfISOWeek(date);
    const end = endOfISOWeek(date);
    const w = getISOWeek(date);
    return { start, end, label: `Sem ${w}` };
  }
  const start = startOfMonth(date);
  const end = endOfMonth(date);
  const monthNames = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  return { start, end, label: `${monthNames[getMonth(date)]} ${getYear(date)}` };
}
