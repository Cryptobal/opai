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
  /** Fecha (YMD) del saldo inicial del ledger; null si la cuenta no lo tiene. */
  lastSnapshotYmd: string | null;
  /** "OPENING" cuando hay saldo inicial; null si el saldo es solo el cache. */
  anchorSource: "OPENING" | "MANUAL" | "IMPORT" | "CALCULATED" | null;
  anchorBalanceClp: number;
  txDeltaClp: number;
  txCount: number;
  /** True si falta definir el saldo inicial (el saldo mostrado no es un ledger). */
  needsOpening: boolean;
  lastDiscrepancy: { asOfYmd: string; deltaClp: number } | null;
}

export interface OpeningBalanceDetail {
  totalClp: number;
  perAccount: OpeningBalanceAccount[];
  /** Cartola más reciente entre las cuentas (para avisar si está desactualizada). */
  lastSnapshotYmd: string | null;
  /** Umbral del tenant para pintar/exigir nota por diferencia de saldo. */
  discrepancyThresholdClp: number;
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
  /** Inconsistencia sello↔sello por columna (null = ok). */
  balanceBreaks: Array<BalanceBreak | null>;
  /** DTEs excluidos del flujo (auditable; restaurables). */
  excludedIncome: FlowExcludedDte[];
  /** Facturas emitidas sin fila (no van a la bandeja "Otros ingresos"). */
  unroutedIncome: { count: number; totalClp: number };
  kpis: { saldoHoy: number; minBalance: number; minWeek: string };
}

export type { FlowMatrixRowDto, MatrixColumn, BalanceBreak };
export type { FlowMatrixCellDto } from "./matrix-assemble";
