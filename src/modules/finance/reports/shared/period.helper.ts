import type {
  FinanceReportPeriod,
  FinanceReportPeriodType,
  FinanceReportComparison,
} from "./types";

const TZ = "America/Santiago";
const MES_ES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];
const MES_ES_SHORT = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
];

export function buildPeriod(
  type: FinanceReportPeriodType,
  ref: Date,
  customRange?: { from: string; to: string }
): FinanceReportPeriod {
  const y = ref.getFullYear();
  const m = ref.getMonth();
  if (type === "month") {
    const from = new Date(y, m, 1);
    const to = new Date(y, m + 1, 0);
    return { type, from: toISO(from), to: toISO(to), label: `${MES_ES[m]} ${y}` };
  }
  if (type === "quarter") {
    const q = Math.floor(m / 3);
    const from = new Date(y, q * 3, 1);
    const to = new Date(y, q * 3 + 3, 0);
    return { type, from: toISO(from), to: toISO(to), label: `Q${q + 1} ${y}` };
  }
  if (type === "year") {
    return { type, from: `${y}-01-01`, to: `${y}-12-31`, label: `Año ${y}` };
  }
  if (type === "ytd") {
    const to = new Date(y, m + 1, 0);
    return { type, from: `${y}-01-01`, to: toISO(to), label: `YTD ${y}` };
  }
  if (type === "custom" && customRange) {
    return {
      type,
      from: customRange.from,
      to: customRange.to,
      label: `${customRange.from} → ${customRange.to}`,
    };
  }
  throw new Error(`Período inválido: ${type}`);
}

export function previousPeriod(p: FinanceReportPeriod): FinanceReportPeriod {
  const from = parseISODate(p.from);
  const to = parseISODate(p.to);
  if (p.type === "month") {
    return buildPeriod("month", new Date(from.getFullYear(), from.getMonth() - 1, 15));
  }
  if (p.type === "quarter") {
    return buildPeriod("quarter", new Date(from.getFullYear(), from.getMonth() - 3, 15));
  }
  if (p.type === "year") {
    return buildPeriod("year", new Date(from.getFullYear() - 1, 6, 15));
  }
  if (p.type === "ytd") {
    return buildPeriod("ytd", new Date(from.getFullYear() - 1, to.getMonth(), 15));
  }
  // custom: ventana inmediatamente anterior con misma duración
  const ms = to.getTime() - from.getTime();
  const newTo = new Date(from.getTime() - 24 * 3600 * 1000);
  const newFrom = new Date(newTo.getTime() - ms);
  return {
    type: "custom",
    from: toISO(newFrom),
    to: toISO(newTo),
    label: `${toISO(newFrom)} → ${toISO(newTo)}`,
  };
}

export function yearAgoPeriod(p: FinanceReportPeriod): FinanceReportPeriod {
  const adjust = (s: string) => {
    const d = parseISODate(s);
    return toISO(new Date(d.getFullYear() - 1, d.getMonth(), d.getDate()));
  };
  return {
    ...p,
    from: adjust(p.from),
    to: adjust(p.to),
    label: `${p.label} (año ant.)`,
  };
}

export function buildComparison(p: FinanceReportPeriod): FinanceReportComparison {
  return { prev: previousPeriod(p), yearAgo: yearAgoPeriod(p) };
}

export function splitMonths(
  p: FinanceReportPeriod
): Array<{ year: number; month: number; key: string; label: string }> {
  const out: Array<{ year: number; month: number; key: string; label: string }> = [];
  const from = parseISODate(p.from);
  const to = parseISODate(p.to);
  const cursor = new Date(from.getFullYear(), from.getMonth(), 1);
  while (cursor <= to) {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    out.push({
      year: y,
      month: m + 1,
      key: `${y}-${String(m + 1).padStart(2, "0")}`,
      label: MES_ES_SHORT[m],
    });
    cursor.setMonth(m + 1);
  }
  return out;
}

export function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function parseISODate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export const PERIOD_TZ = TZ;
export const MES_LABELS_FULL = MES_ES;
export const MES_LABELS_SHORT = MES_ES_SHORT;
