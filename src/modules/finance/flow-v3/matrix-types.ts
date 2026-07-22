/**
 * Tipos del response del matrix v3, en archivo PURO (sin "server-only") para
 * que los componentes client de la planilla los importen sin arrastrar prisma.
 */
import type { FlowMatrixRowDto } from "./matrix-assemble";
import type { MatrixColumn } from "./matrix-monthly";

export interface FlowMatrixResponse {
  granularity: "week" | "month";
  columns: MatrixColumn[];
  currentWeek: string;
  todayYmd: string;
  openingBalance: number;
  warnThreshold: number;
  rows: FlowMatrixRowDto[];
  flows: number[];
  balances: number[];
  kpis: { saldoHoy: number; minBalance: number; minWeek: string };
}

export type { FlowMatrixRowDto, MatrixColumn };
export type { FlowMatrixCellDto } from "./matrix-assemble";
