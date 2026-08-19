/**
 * Desglose auditable del saldo acumulado (semana actual abierta):
 *   saldo = bancoHoy + Σ pendientes
 * donde pendiente = effective − real (plata aún no movida en banco).
 */
import type { FlowMatrixRowDto } from "./matrix-types";

export interface WeekPendingBreakdown {
  /** Σ (effective − real) > 0 */
  pendingIncome: number;
  /** Σ |effective − real| cuando < 0 */
  pendingExpense: number;
  /** pendingIncome − pendingExpense */
  pendingNet: number;
}

export function weekPendingBreakdown(
  rows: FlowMatrixRowDto[],
  colIdx: number,
): WeekPendingBreakdown {
  let pendingIncome = 0;
  let pendingExpense = 0;
  for (const row of rows) {
    const cell = row.cells[colIdx];
    if (!cell) continue;
    const pending = cell.effective - (cell.real?.total ?? 0);
    if (pending > 0) pendingIncome += pending;
    else if (pending < 0) pendingExpense += -pending;
  }
  pendingIncome = Math.round(pendingIncome);
  pendingExpense = Math.round(pendingExpense);
  return {
    pendingIncome,
    pendingExpense,
    pendingNet: pendingIncome - pendingExpense,
  };
}

/** Texto de tooltip para la celda de saldo de la semana actual. */
export function currentWeekBalanceTitle(
  bankToday: number,
  breakdown: WeekPendingBreakdown,
  balance: number,
): string {
  return [
    `Banco hoy ${fmt(bankToday)}`,
    `+ ingresos pendientes ${fmt(breakdown.pendingIncome)}`,
    `− egresos pendientes ${fmt(breakdown.pendingExpense)}`,
    `= ${fmt(balance)}`,
  ].join(" · ");
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString("es-CL");
}
