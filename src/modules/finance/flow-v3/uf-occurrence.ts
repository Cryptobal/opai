/**
 * Resolución pura de fecha de UF según política (testable sin Prisma).
 * Políticas alineadas con cashflow v2 uf-resolver.
 */
import { ymdToDate } from "./weeks";
export type UfPolicy =
  | "RUN_DAY"
  | "LAST_DAY_MONTH"
  | "LAST_DAY_PREV_MONTH"
  | "CUSTOM_DAY"
  | "FIRST_DAY_MONTH";

export const UF_POLICIES: UfPolicy[] = [
  "RUN_DAY",
  "LAST_DAY_MONTH",
  "LAST_DAY_PREV_MONTH",
  "CUSTOM_DAY",
];

export const UF_POLICY_LABELS: Record<UfPolicy, string> = {
  RUN_DAY: "Día de la ocurrencia",
  LAST_DAY_MONTH: "Último día del mes",
  LAST_DAY_PREV_MONTH: "Último día del mes anterior",
  CUSTOM_DAY: "Día fijo del mes",
  FIRST_DAY_MONTH: "Primer día del mes",
};

function daysInMonthUTC(year: number, monthZeroBased: number): number {
  return new Date(Date.UTC(year, monthZeroBased + 1, 0)).getUTCDate();
}

/** Fecha (UTC Date) sobre la que se busca el valor UF. */
export function ufTargetDate(
  policy: string | null | undefined,
  customDay: number | null | undefined,
  scheduledDate: Date,
): Date {
  const p = (policy ?? "RUN_DAY") as UfPolicy;
  const y = scheduledDate.getUTCFullYear();
  const m = scheduledDate.getUTCMonth();
  switch (p) {
    case "LAST_DAY_PREV_MONTH": {
      const prev = m === 0 ? 11 : m - 1;
      const py = m === 0 ? y - 1 : y;
      return new Date(Date.UTC(py, prev, daysInMonthUTC(py, prev)));
    }
    case "FIRST_DAY_MONTH":
      return new Date(Date.UTC(y, m, 1));
    case "LAST_DAY_MONTH":
      return new Date(Date.UTC(y, m, daysInMonthUTC(y, m)));
    case "CUSTOM_DAY": {
      const d = customDay ?? 1;
      const clamped = Math.min(d, daysInMonthUTC(y, m));
      return new Date(Date.UTC(y, m, clamped));
    }
    case "RUN_DAY":
    default:
      return scheduledDate;
  }
}

/** CLP entero = round(amountUf * ufValue). */
export function ufToClp(amountUf: number, ufValue: number): number {
  if (!Number.isFinite(amountUf) || !Number.isFinite(ufValue)) return 0;
  return Math.round(amountUf * ufValue);
}

function calendarMonthsBetween(fromYmd: string, toYmd: string): number {
  const from = ymdToDate(fromYmd);
  const to = ymdToDate(toYmd);
  if (!from || !to) return 0;
  return (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
}

/**
 * Proyecta UF con growth compuesto mensual.
 * months = meses calendario enteros desde lastPublishedYmd hasta targetYmd (si target <= last → retorna lastUfValue).
 * projected = lastUfValue * (1 + growthPct/100)^months
 * growthPct=0 → idéntico a lastUfValue.
 */
export function projectUfWithGrowth(
  lastUfValue: number,
  lastPublishedYmd: string,
  targetYmd: string,
  growthPct: number,
): number {
  if (!Number.isFinite(lastUfValue)) return 0;
  const last = ymdToDate(lastPublishedYmd);
  const target = ymdToDate(targetYmd);
  if (!last || !target) return lastUfValue;
  if (target.getTime() <= last.getTime()) return lastUfValue;
  if (!Number.isFinite(growthPct) || growthPct === 0) return lastUfValue;
  const months = calendarMonthsBetween(lastPublishedYmd, targetYmd);
  if (months <= 0) return lastUfValue;
  return lastUfValue * Math.pow(1 + growthPct / 100, months);
}
