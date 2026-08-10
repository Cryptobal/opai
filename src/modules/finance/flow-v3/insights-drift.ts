/**
 * Desviaciones mensuales del Panel: totales de mes por canonicalKey.
 * Puro — sin Prisma / server-only.
 *
 * Asignación de mes: por `weekStart.slice(0, 7)` (mes del lunes ISO).
 * Una semana que cruza dos meses calendario queda en el del lunes.
 */
import type { FlowMatrixCellDto, FlowMatrixRowDto } from "./matrix-assemble";

export const DRIFT_CANONICAL_KEYS = [
  "SUELDO",
  "QUINCENA",
  "PREVIRED",
  "TURNO_EXTRA",
  "FINIQUITO",
  "IVA_F29",
  "FACTORING",
  "CREDITO",
  "APORTE_SOCIO",
  "RETIRO_SOCIO",
  "DEVOL_PRESTAMO_SOCIO",
] as const;

export type DriftCanonicalKey = (typeof DRIFT_CANONICAL_KEYS)[number];

const DRIFT_KEY_SET = new Set<string>(DRIFT_CANONICAL_KEYS);

/** Fallback por nombre normalizado para filas aún sin canonicalKey. */
const DRIFT_ROW_NAMES = [
  "sueldos liquidos",
  "sueldos líquidos",
  "quincena (anticipos)",
  "quincena",
  "imposiciones (previred)",
  "previred",
  "imposiciones",
  "turnos extra",
  "finiquitos",
  "iva f29",
  "f29 (iva + ppm)",
  "costo factoring",
  "creditos / financiamiento",
  "créditos / financiamiento",
  "retiro socios",
  "aporte socios",
  "devolucion a socios",
  "devolución a socios",
];

export interface MonthlyDriftCellV2 {
  monthKey: string;
  projected: number;
  real: number;
  delta: number;
  pct: number | null;
  partial: boolean;
  weeksElapsed: number;
  weeksTotal: number;
}

export interface MonthlyDriftRowV2 {
  rowId: string;
  name: string;
  canonicalKey: string | null;
  months: MonthlyDriftCellV2[];
  allZero: boolean;
}

function normalizeInsightName(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function isDriftNameMatch(name: string): boolean {
  const n = normalizeInsightName(name);
  return DRIFT_ROW_NAMES.some((k) => {
    const nk = normalizeInsightName(k);
    return n === nk || n.includes(nk);
  });
}

/** ¿La fila entra al análisis de drift? canonicalKey gana; nombre solo si falta llave. */
export function isDriftRow(row: {
  name: string;
  canonicalKey?: string | null;
}): boolean {
  if (row.canonicalKey != null) {
    return DRIFT_KEY_SET.has(row.canonicalKey);
  }
  return isDriftNameMatch(row.name);
}

export function projMag(cell: FlowMatrixCellDto): number {
  if (cell.projected != null) return Math.abs(cell.projected);
  if (cell.plan !== 0) return Math.abs(cell.plan);
  return Math.abs(cell.committed?.total ?? 0);
}

export function realMag(cell: FlowMatrixCellDto): number {
  return cell.real ? Math.abs(cell.real.total) : 0;
}

function countWeeksInMonth(
  weekStarts: string[],
  monthKey: string,
  currentWeek: string,
): { weeksTotal: number; weeksElapsed: number } {
  const inMonth = weekStarts.filter((w) => w.slice(0, 7) === monthKey);
  const weeksTotal = inMonth.length;
  const weeksElapsed = inMonth.filter((w) => w <= currentWeek).length;
  return { weeksTotal, weeksElapsed };
}

/**
 * Totales de mes independientes (projected y real sobre TODAS las celdas).
 * Mes en curso: projected solo suma semanas ya iniciadas (`weekStart <= currentWeek`).
 */
export function buildMonthlyDrifts(
  rows: FlowMatrixRowDto[],
  opts: {
    monthKeys: string[];
    currentWeek: string;
    todayYmd: string;
  },
): MonthlyDriftRowV2[] {
  const { monthKeys, currentWeek, todayYmd } = opts;
  const currentMonth = todayYmd.slice(0, 7);
  const allWeekStarts = rows[0]?.cells.map((c) => c.weekStart) ?? [];

  const weekMeta = new Map(
    monthKeys.map((mk) => [mk, countWeeksInMonth(allWeekStarts, mk, currentWeek)]),
  );

  const result: MonthlyDriftRowV2[] = [];

  for (const row of rows) {
    if (!isDriftRow(row)) continue;

    const byMonth = new Map<string, { projected: number; real: number }>();
    for (const mk of monthKeys) byMonth.set(mk, { projected: 0, real: 0 });

    for (const cell of row.cells) {
      const mk = cell.weekStart.slice(0, 7);
      const bucket = byMonth.get(mk);
      if (!bucket) continue;
      const r = realMag(cell);
      const p = projMag(cell);
      bucket.real += r;
      const isCurrentMonth = mk === currentMonth;
      if (isCurrentMonth) {
        if (cell.weekStart <= currentWeek) bucket.projected += p;
      } else {
        bucket.projected += p;
      }
    }

    const months: MonthlyDriftCellV2[] = monthKeys.map((mk) => {
      const b = byMonth.get(mk)!;
      const projected = Math.round(b.projected);
      const real = Math.round(b.real);
      const delta = Math.round(real - projected);
      const pct =
        projected > 0 ? Math.round((delta / projected) * 100) : null;
      const meta = weekMeta.get(mk) ?? { weeksTotal: 0, weeksElapsed: 0 };
      const partial = mk === currentMonth;
      return {
        monthKey: mk,
        projected,
        real,
        delta,
        pct,
        partial,
        weeksElapsed: meta.weeksElapsed,
        weeksTotal: meta.weeksTotal,
      };
    });

    const allZero = months.every((m) => m.projected === 0 && m.real === 0);
    result.push({
      rowId: row.id,
      name: row.name,
      canonicalKey: row.canonicalKey ?? null,
      months,
      allZero,
    });
  }

  return result;
}
