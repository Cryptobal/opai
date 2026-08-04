/**
 * Reducción PURA de la matriz semanal a columnas mensuales (server-side).
 * Cada semana pertenece al mes de su lunes (monthKeyOf). El saldo del mes es
 * el de su última semana; el flujo es la suma; el comprometido/real fusionan
 * items para el popover.
 */
import { monthKeyOf, weekLabel } from "./weeks";
import type {
  AssembledMatrix,
  FlowMatrixCellDto,
  FlowMatrixRowDto,
} from "./matrix-assemble";

export interface MatrixColumn {
  /** Semana: lunes YMD · Mes: YYYY-MM. */
  key: string;
  label: string;
  monthKey: string;
  weekStart: string;
  isCurrent: boolean;
  isPast: boolean;
  /** Semanas agrupadas (1 en granularidad semanal). */
  weekCount: number;
}

const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export function weeklyColumns(weeks: string[], currentWeek: string): MatrixColumn[] {
  return weeks.map((w) => ({
    key: w,
    label: weekLabel(w),
    monthKey: monthKeyOf(w),
    weekStart: w,
    isCurrent: w === currentWeek,
    isPast: w < currentWeek,
    weekCount: 1,
  }));
}

function mergeCells(cells: FlowMatrixCellDto[]): FlowMatrixCellDto {
  const merged: FlowMatrixCellDto = {
    weekStart: cells[0].weekStart,
    plan: 0,
    committed: null,
    real: null,
    effective: 0,
    layer: "empty",
    note: null,
  };
  const noteParts: string[] = [];
  for (const c of cells) {
    merged.plan += c.plan;
    merged.effective += c.effective;
    if (c.committed) {
      merged.committed = merged.committed ?? { total: 0, items: [] };
      merged.committed.total += c.committed.total;
      merged.committed.items.push(...c.committed.items);
    }
    if (c.real) {
      merged.real = merged.real ?? { total: 0, items: [] };
      merged.real.total += c.real.total;
      merged.real.items.push(...c.real.items);
    }
    if (c.note?.trim()) noteParts.push(c.note.trim());
  }
  if (merged.real && merged.real.total !== 0) merged.layer = "real";
  else if (merged.committed && merged.committed.total !== 0) merged.layer = "committed";
  else if (merged.plan !== 0) merged.layer = "plan";
  merged.note = noteParts.length > 0 ? noteParts.join(" · ") : null;
  return merged;
}

export function reduceMonthly(
  weeks: string[],
  currentWeek: string,
  m: AssembledMatrix,
): {
  columns: MatrixColumn[];
  rows: FlowMatrixRowDto[];
  flows: number[];
  balances: number[];
  balanceBreaks: AssembledMatrix["balanceBreaks"];
} {
  const groups: Array<{ key: string; idx: number[] }> = [];
  weeks.forEach((w, i) => {
    const key = monthKeyOf(w);
    const g = groups[groups.length - 1];
    if (g && g.key === key) g.idx.push(i);
    else groups.push({ key, idx: [i] });
  });

  const columns: MatrixColumn[] = groups.map((g) => {
    const [y, mo] = g.key.split("-").map(Number);
    const inWeeks = g.idx.map((i) => weeks[i]);
    return {
      key: g.key,
      label: `${MONTHS[mo - 1]} ${y}`,
      monthKey: g.key,
      weekStart: inWeeks[0],
      isCurrent: inWeeks.includes(currentWeek),
      isPast: inWeeks[inWeeks.length - 1] < currentWeek,
      weekCount: inWeeks.length,
    };
  });

  const rows: FlowMatrixRowDto[] = m.rows.map((r) => ({
    ...r,
    cells: groups.map((g) => mergeCells(g.idx.map((i) => r.cells[i]))),
  }));
  const flows = groups.map((g) => g.idx.reduce((s, i) => s + m.flows[i], 0));
  const balances = groups.map((g) => m.balances[g.idx[g.idx.length - 1]]);
  const balanceBreaks = groups.map((g) => m.balanceBreaks[g.idx[g.idx.length - 1]] ?? null);
  return { columns, rows, flows, balances, balanceBreaks };
}
