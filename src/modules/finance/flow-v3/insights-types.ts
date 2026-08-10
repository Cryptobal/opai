/**
 * Tipos del DTO de /insights — puros (sin server-only) para UI + servicio.
 */
import type { AgingBuckets } from "./insights-aging";
import type { MonthlyDriftRowV2 } from "./insights-drift";
import type {
  PanelDataHealth,
  PanelKpisDerived,
  PanelTopMovers,
  PanelWeekPoint,
} from "./insights-series";

export interface CarteraPendienteItem {
  dteId: string;
  folio: number | null;
  receiverName: string | null;
  issueDate: string;
  dueDate: string;
  overdueDays: number;
  pendingClp: number;
  anchoredWeek: string;
  anchoredWeekLabel: string;
  crmAccountId: string | null;
  ceded?: boolean;
  cededPct?: number;
}

export interface OpenMoveWeek {
  weekStart: string;
  label: string;
}

export interface FlowInsightsDto {
  todayYmd: string;
  currentWeek: string;
  saldoHoy: number | null;
  bufferClp: number;
  warnThresholdClp: number;
  weeks: PanelWeekPoint[];
  kpis: PanelKpisDerived;
  dataHealth: PanelDataHealth;
  topMovers: PanelTopMovers;
  porCobrarTotal: number;
  aging: AgingBuckets;
  agingByDue: AgingBuckets;
  agingMeta: { collectionLagDays: number };
  cartera: CarteraPendienteItem[];
  openMoveWeeks: OpenMoveWeek[];
  recentSeals: Array<{
    weekEnd: string;
    closedBalance: number;
    projectedBalance: number;
    delta: number;
  }>;
  monthlyDrifts: MonthlyDriftRowV2[];
  /** @deprecated Usar `weeks`. */
  balanceSeries: Array<{ weekStart: string; label: string; balance: number }>;
  /** @deprecated Usar kpis.firstNegative / kpis.firstBreach. */
  redWeek: { weekStart: string; balance: number } | null;
  /** @deprecated Usar kpis.min12. */
  min12: { weekStart: string; balance: number } | null;
}

export type {
  AgingBuckets,
  MonthlyDriftRowV2,
  PanelDataHealth,
  PanelKpisDerived,
  PanelTopMovers,
  PanelWeekPoint,
};
