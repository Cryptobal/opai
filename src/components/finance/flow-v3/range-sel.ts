import type { CellSel } from "./usePlanillaKeyboard";

export interface RangeSel {
  anchor: CellSel;
  head: CellSel;
}

/** Clave estable de celda para selección discontinua (modo Σ). */
export function cellKey(rowId: string, colIdx: number): string {
  return `${rowId}:${colIdx}`;
}

export interface DiscreteSelStats {
  sum: number;
  avg: number | null;
  count: number;
  /** N de celdas con valor ≠ 0 (denominador del promedio). */
  nonzeroCount: number;
}

/**
 * Stats puras del set discontinuo. Promedio solo sobre celdas ≠ 0
 * (misma convención que el statusbar / SumPill).
 */
export function discreteStats(values: Iterable<number>): DiscreteSelStats {
  let sum = 0;
  let count = 0;
  let nonzeroCount = 0;
  for (const v of values) {
    sum += v;
    count += 1;
    if (v !== 0) nonzeroCount += 1;
  }
  return {
    sum,
    avg: nonzeroCount > 0 ? Math.round(sum / nonzeroCount) : null,
    count,
    nonzeroCount,
  };
}

/** Toggle de una celda en el Map de selección discontinua. */
export function toggleDiscreteCell(
  prev: Map<string, number>,
  key: string,
  value: number,
): Map<string, number> {
  const next = new Map(prev);
  if (next.has(key)) next.delete(key);
  else next.set(key, value);
  return next;
}

export interface RangeRect {
  r0: number;
  r1: number;
  c0: number;
  c1: number;
}

/** Rectángulo del rango sobre filas visibles (orden actual). */
export function rangeRect(range: RangeSel, visibleRowIds: string[]): RangeRect | null {
  const ai = visibleRowIds.indexOf(range.anchor.rowId);
  const hi = visibleRowIds.indexOf(range.head.rowId);
  if (ai < 0 || hi < 0) return null;
  return {
    r0: Math.min(ai, hi),
    r1: Math.max(ai, hi),
    c0: Math.min(range.anchor.colIdx, range.head.colIdx),
    c1: Math.max(range.anchor.colIdx, range.head.colIdx),
  };
}

export function isInRect(rowIdx: number, colIdx: number, rect: RangeRect): boolean {
  return rowIdx >= rect.r0 && rowIdx <= rect.r1 && colIdx >= rect.c0 && colIdx <= rect.c1;
}

export function isSingleCell(rect: RangeRect): boolean {
  return rect.r0 === rect.r1 && rect.c0 === rect.c1;
}

/**
 * Clases de rango estilo Sheets. Celda única → planilla-selected.
 * Multi: tinte + bordes de perímetro; handle solo en head.
 */
export function cellRangeClass(
  rowIdx: number,
  colIdx: number,
  rect: RangeRect | null,
  head: CellSel | null,
  rowId: string,
): string {
  if (!rect || !isInRect(rowIdx, colIdx, rect)) return "";
  const isHead = !!head && head.rowId === rowId && head.colIdx === colIdx;
  if (isSingleCell(rect)) return isHead ? "planilla-selected" : "";
  const parts = ["planilla-range"];
  if (rowIdx === rect.r0) parts.push("planilla-range-t");
  if (rowIdx === rect.r1) parts.push("planilla-range-b");
  if (colIdx === rect.c0) parts.push("planilla-range-l");
  if (colIdx === rect.c1) parts.push("planilla-range-r");
  if (isHead) parts.push("planilla-range-head");
  return parts.join(" ");
}

/** Lista de celdas (rowId, colIdx) del rectángulo en orden fila×columna. */
export function cellsInRect(
  rect: RangeRect,
  visibleRowIds: string[],
): Array<{ rowId: string; colIdx: number }> {
  const out: Array<{ rowId: string; colIdx: number }> = [];
  for (let r = rect.r0; r <= rect.r1; r++) {
    const rowId = visibleRowIds[r];
    if (!rowId) continue;
    for (let c = rect.c0; c <= rect.c1; c++) {
      out.push({ rowId, colIdx: c });
    }
  }
  return out;
}

/** Serializa valores CLP crudos a TSV (pegable en Sheets/Excel). */
export function rangeToTsv(grid: number[][]): string {
  if (grid.length === 0) return "";
  if (grid.length === 1 && grid[0].length === 1) return String(Math.round(grid[0][0]));
  return grid.map((row) => row.map((v) => String(Math.round(v))).join("\t")).join("\n");
}
