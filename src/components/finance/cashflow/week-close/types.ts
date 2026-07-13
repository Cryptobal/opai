/** Shape del payload que retorna GET /api/finance/cashflow/weekly-close/snapshot.
 *  Mantiene las fechas como ISO strings (no Date) porque viaja por el wire.
 *  El drawer y sus sub-componentes consumen este DTO directamente. */
export interface WeeklyCloseSnapshotDTO {
  weekStartDate: string;
  weekEndDate: string;
  bankBalanceClp: number;
  /** Saldo banco al abrir la semana (cierre del día previo al weekStart).
   *  Base real de la ecuación apertura + ingresos − egresos = cierre. */
  openingBalanceClp: number;
  projectedBalanceClp: number;
  varianceClp: number;
  unassignedBank: Array<{
    id: string;
    transactionDate: string;
    description: string;
    amount: number;
    accountPlanCode: string | null;
  }>;
  unfulfilledProj: Array<{
    occurrenceId: string;
    itemName: string;
    installationName: string | null;
    scheduledDate: string;
    amountClp: number;
    kind: "INCOME" | "EXPENSE";
    categoryCode: string;
  }>;
  /** Ancla vigente del tenant (cierre con isAnchor=true). Null si no hay. El
   *  drawer lo usa para detectar el retroceso del ancla y su impacto en CLP. */
  currentAnchor?: { weekEndDate: string; balanceClp: number } | null;
  /** Cierre (weekEnd) de la semana en curso. Referencia para decidir si la
   *  semana que se cierra es la más reciente (default de anclar). */
  nextClosingWeekEndDate?: string;
}

export type VarianceResolution = "ADJUSTED" | "ACCEPTED" | "PENDING";

export const fmtCLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  minimumFractionDigits: 0,
});
