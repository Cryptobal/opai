/**
 * Contadores de facturas "por asignar" en la bandeja (Otros ingresos /
 * Otros egresos). Puro — lee la matriz ya ensamblada, sin queries.
 */
import type { FlowMatrixRowDto } from "./matrix-assemble";
import { FALLBACK_EXPENSE_NAME, FALLBACK_INCOME_NAME } from "./canonical-rows";

export function isFallbackBandejaRow(row: {
  isVirtual?: boolean;
  name: string;
}): boolean {
  if (row.isVirtual) return true;
  return (
    row.name === FALLBACK_INCOME_NAME ||
    row.name === "Otros clientes" ||
    row.name === FALLBACK_EXPENSE_NAME ||
    row.name === "Otros gastos"
  );
}

/** DTEs (kind=dte) en una celda de bandeja. */
export function countAssignPendingInCell(cell: {
  committed?: { items?: Array<{ kind: string }> } | null;
}): number {
  return (cell.committed?.items ?? []).filter((i) => i.kind === "dte").length;
}

/** Total de DTEs por asignar en la ventana (todas las semanas de filas bandeja). */
export function countAssignPendingInWindow(
  rows: FlowMatrixRowDto[],
  section?: string,
): number {
  let n = 0;
  for (const row of rows) {
    if (!isFallbackBandejaRow(row)) continue;
    if (section && row.section !== section) continue;
    for (const cell of row.cells) {
      n += countAssignPendingInCell(cell);
    }
  }
  return n;
}

/** Caption por celda: "N por asignar" o null. */
export function assignPendingCaption(n: number): string | null {
  if (n <= 0) return null;
  return n === 1 ? "1 por asignar" : `${n} por asignar`;
}
