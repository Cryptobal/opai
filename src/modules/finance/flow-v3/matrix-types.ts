/**
 * Tipos del response del matrix v3, en archivo PURO (sin "server-only") para
 * que los componentes client de la planilla los importen sin arrastrar prisma.
 */
import type { BalanceBreak, FlowMatrixRowDto } from "./matrix-assemble";
import type { MatrixColumn } from "./matrix-monthly";
import type { FlowExcludedDte } from "./types";

/** Desglose del saldo bancario por cuenta (número SIEMPRE enmascarado). */
export interface OpeningBalanceAccount {
  bankName: string;
  /** Últimos 4 dígitos, ej. "••1234". Nunca el número completo. */
  accountMasked: string;
  balanceClp: number;
  /** Fecha (YMD) de la última cartola/snapshot usada como ancla; null si no hay. */
  lastSnapshotYmd: string | null;
}

export interface OpeningBalanceDetail {
  totalClp: number;
  perAccount: OpeningBalanceAccount[];
  /** Cartola más reciente entre las cuentas (para avisar si está desactualizada). */
  lastSnapshotYmd: string | null;
}

export interface FlowMatrixResponse {
  granularity: "week" | "month";
  columns: MatrixColumn[];
  currentWeek: string;
  todayYmd: string;
  openingBalance: number;
  /** Desglose del saldo banco de hoy por cuenta (§5H). */
  openingBalanceDetail: OpeningBalanceDetail;
  /** Lunes ISO (YMD) de las semanas selladas por cierre (§5G). */
  closedWeeks: string[];
  /** Anclas manuales de saldo acumulado (lunes ISO → CLP). */
  balanceAnchors?: Record<string, number>;
  warnThreshold: number;
  /** Umbral |delta| CLP para alertar desviación real vs proyectado. */
  driftAlertThresholdClp?: number;
  /** Si true, el remanente no ejecutado sigue pesando en la semana. */
  residualCarryEnabled?: boolean;
  /** Remanente CLP bajo el cual se da por cumplida la proyección. */
  residualMinClp?: number;
  rows: FlowMatrixRowDto[];
  flows: number[];
  balances: number[];
  /** Descuadre sello↔derivado por columna (null = ok). */
  balanceBreaks: Array<BalanceBreak | null>;
  /** DTEs excluidos del flujo (auditable; restaurables). */
  excludedIncome: FlowExcludedDte[];
  /** Facturas emitidas sin fila (no van a la bandeja "Otros ingresos"). */
  unroutedIncome: { count: number; totalClp: number };
  kpis: { saldoHoy: number; minBalance: number; minWeek: string };
}

export type { FlowMatrixRowDto, MatrixColumn, BalanceBreak };
export type { FlowMatrixCellDto } from "./matrix-assemble";
