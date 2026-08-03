/**
 * Tipos del response del matrix v3, en archivo PURO (sin "server-only") para
 * que los componentes client de la planilla los importen sin arrastrar prisma.
 */
import type { BalanceBreak, FlowMatrixRowDto } from "./matrix-assemble";
import type { MatrixColumn } from "./matrix-monthly";

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
  warnThreshold: number;
  rows: FlowMatrixRowDto[];
  flows: number[];
  balances: number[];
  /** Descuadre sello↔derivado por columna (null = ok). */
  balanceBreaks: Array<BalanceBreak | null>;
  kpis: { saldoHoy: number; minBalance: number; minWeek: string };
}

export type { FlowMatrixRowDto, MatrixColumn, BalanceBreak };
export type { FlowMatrixCellDto } from "./matrix-assemble";
