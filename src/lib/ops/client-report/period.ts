import { toZonedTime, fromZonedTime } from "date-fns-tz";
import {
  CHILE_TZ,
  addDaysChile,
  isoWeekChile,
  startOfDayChile,
  ymdInChile,
} from "@/lib/dates-cl";
import type { ReportFrequency, ReportPeriod } from "./types";

export function chileWallClock(now: Date = new Date()): {
  year: number;
  month: number;
  day: number;
  hour: number;
  weekdayMon0: number;
} {
  const local = toZonedTime(now, CHILE_TZ);
  const day = local.getDay(); // 0=domingo
  return {
    year: local.getFullYear(),
    month: local.getMonth() + 1,
    day: local.getDate(),
    hour: local.getHours(),
    weekdayMon0: day === 0 ? 6 : day - 1,
  };
}

/** Lunes 00:00 Chile de la semana que contiene `now`. */
export function startOfWeekChile(now: Date = new Date()): Date {
  const local = toZonedTime(startOfDayChile(now), CHILE_TZ);
  const day = local.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  local.setDate(local.getDate() + mondayOffset);
  local.setHours(0, 0, 0, 0);
  return fromZonedTime(local, CHILE_TZ);
}

export function startOfMonthChile(year: number, month1to12: number): Date {
  const local = new Date(year, month1to12 - 1, 1, 0, 0, 0, 0);
  return fromZonedTime(local, CHILE_TZ);
}

function formatRangeLabel(from: Date, toExclusive: Date): string {
  const last = addDaysChile(toExclusive, -1);
  const a = ymdInChile(from);
  const b = ymdInChile(last);
  const fmt = (ymd: string) => {
    const [y, m, d] = ymd.split("-");
    return `${d}/${m}/${y}`;
  };
  return `${fmt(a)} – ${fmt(b)}`;
}

/** Semana calendario anterior (lunes 00:00 → lunes siguiente 00:00, Chile). */
export function previousClosedWeek(now: Date = new Date()): ReportPeriod {
  const thisMonday = startOfWeekChile(now);
  const from = addDaysChile(thisMonday, -7);
  const keyYear = ymdInChile(from).slice(0, 4);
  const week = String(isoWeekChile(from)).padStart(2, "0");
  return {
    from,
    to: thisMonday,
    key: `${keyYear}-W${week}`,
    label: `Semana ${week} · ${formatRangeLabel(from, thisMonday)}`,
  };
}

/** Mes calendario anterior (Chile). */
export function previousClosedMonth(now: Date = new Date()): ReportPeriod {
  const { year, month } = chileWallClock(now);
  let y = year;
  let m = month - 1;
  if (m < 1) {
    m = 12;
    y -= 1;
  }
  const from = startOfMonthChile(y, m);
  const to = startOfMonthChile(year, month);
  const months = [
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
  ];
  return {
    from,
    to,
    key: `${y}-${String(m).padStart(2, "0")}`,
    label: `${months[m - 1]} ${y} · ${formatRangeLabel(from, to)}`,
  };
}

export function periodForFrequency(
  frequency: ReportFrequency,
  now: Date = new Date()
): ReportPeriod {
  return frequency === "monthly"
    ? previousClosedMonth(now)
    : previousClosedWeek(now);
}

export type PeriodPreset = "last_week" | "this_week" | "last_month" | "custom";

export function periodFromPreset(opts: {
  preset?: PeriodPreset;
  from?: string;
  to?: string;
  now?: Date;
}): ReportPeriod {
  const preset = opts.preset ?? "last_week";
  if (preset === "last_month") return previousClosedMonth(opts.now);
  if (preset === "this_week") return currentOpenWeek(opts.now);
  if (preset === "custom" && opts.from && opts.to) {
    return parseYmdRange(opts.from, opts.to);
  }
  return previousClosedWeek(opts.now);
}

/** Semana en curso (lunes 00:00 Chile → lunes siguiente). */
export function currentOpenWeek(now: Date = new Date()): ReportPeriod {
  const from = startOfWeekChile(now);
  const to = addDaysChile(from, 7);
  const keyYear = ymdInChile(from).slice(0, 4);
  const week = String(isoWeekChile(from)).padStart(2, "0");
  return {
    from,
    to,
    key: `${keyYear}-W${week}-open`,
    label: `Esta semana · ${formatRangeLabel(from, to)}`,
  };
}

export function parseYmdRange(
  fromYmd: string,
  toYmdInclusive: string
): ReportPeriod {
  const from = startOfDayChile(new Date(`${fromYmd}T12:00:00.000Z`));
  const toExclusive = addDaysChile(
    startOfDayChile(new Date(`${toYmdInclusive}T12:00:00.000Z`)),
    1
  );
  return {
    from,
    to: toExclusive,
    key: `${fromYmd}_${toYmdInclusive}`,
    label: formatRangeLabel(from, toExclusive),
  };
}

export type SendConfig = {
  enabled: boolean;
  frequency: ReportFrequency;
  weekday: number;
  dayOfMonth: number;
  sendHourChile: number;
  lastPeriodKey: string | null;
};

/**
 * ¿Corresponde enviar ahora el período cerrado anterior?
 * Usa hora y calendario Chile. El cron debe correr cada hora.
 */
export function shouldSendNow(
  config: SendConfig,
  now: Date = new Date()
): { send: boolean; period: ReportPeriod } {
  const period = periodForFrequency(config.frequency, now);
  if (!config.enabled) return { send: false, period };

  const clock = chileWallClock(now);
  if (clock.hour !== config.sendHourChile) return { send: false, period };

  if (config.frequency === "weekly") {
    const weekday = ((config.weekday % 7) + 7) % 7;
    if (clock.weekdayMon0 !== weekday) return { send: false, period };
  } else {
    const dim = new Date(clock.year, clock.month, 0).getDate();
    const targetDay = Math.min(Math.max(config.dayOfMonth, 1), dim);
    if (clock.day !== targetDay) return { send: false, period };
  }

  if (config.lastPeriodKey === period.key) return { send: false, period };
  return { send: true, period };
}

export function formatDateTimeCl(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  return d.toLocaleString("es-CL", {
    timeZone: CHILE_TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDateCl(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  return d.toLocaleDateString("es-CL", {
    timeZone: CHILE_TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
