import "server-only";
import { prisma } from "@/lib/prisma";
import { buildFlowMatrix } from "./matrix.service";
import {
  addDaysYmd,
  DEFAULT_COLLECTION_LAG_DAYS,
} from "./types";
import { listClosedV3Weeks } from "./weekly-close.adapter";
import {
  addWeeksUTC,
  toYmd,
  weekLabel,
  weekStartYmd,
  ymdToDate,
} from "./weeks";

export interface CarteraPendienteItem {
  dteId: string;
  folio: number | null;
  receiverName: string | null;
  issueDate: string;
  dueDate: string;
  overdueDays: number;
  pendingClp: number;
  /** Semana (lunes YMD) donde está anclada (emisión u override). */
  anchoredWeek: string;
  anchoredWeekLabel: string;
}

export interface OpenMoveWeek {
  weekStart: string;
  label: string;
}

export interface FlowInsightsDto {
  saldoHoy: number | null;
  redWeek: { weekStart: string; balance: number } | null;
  min12: { weekStart: string; balance: number } | null;
  porCobrarTotal: number;
  aging: { alDia: number; d1_15: number; d16_30: number; d30plus: number };
  /** Cartera global post-exclusiones, ordenada por atraso desc. */
  cartera: CarteraPendienteItem[];
  /** Semanas abiertas (actual + futuras no selladas) para "Mover a…". */
  openMoveWeeks: OpenMoveWeek[];
  balanceSeries: Array<{ weekStart: string; label: string; balance: number }>;
  recentSeals: Array<{
    weekEnd: string;
    closedBalance: number;
    projectedBalance: number;
    delta: number;
  }>;
  warnThresholdClp: number;
  /** Desviaciones mensuales (proyectado vs real) para filas clave v5. */
  monthlyDrifts: MonthlyDriftRow[];
}

export interface MonthlyDriftCell {
  monthKey: string; // YYYY-MM
  projected: number;
  real: number;
  delta: number;
}

export interface MonthlyDriftRow {
  rowId: string;
  name: string;
  months: MonthlyDriftCell[];
}

const DRIFT_ROW_NAMES = [
  "sueldos liquidos",
  "sueldos líquidos",
  "imposiciones (previred)",
  "previred",
  "imposiciones",
  "turnos extra",
  "finiquitos",
  "iva f29",
  "f29 (iva + ppm)",
  "retiro socios",
];

function normalizeInsightName(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function isDriftKeyRow(name: string): boolean {
  const n = normalizeInsightName(name);
  return DRIFT_ROW_NAMES.some((k) => n === k || n.includes(k));
}

function daysBetween(fromYmd: string, toYmd: string): number {
  const a = Date.parse(`${fromYmd}T00:00:00Z`);
  const b = Date.parse(`${toYmd}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/** Panel read-only: 12 semanas desde hoy + aging DTEs + cartera drill + sellos. */
export async function buildFlowInsights(tenantId: string): Promise<FlowInsightsDto> {
  const today = new Date();
  const currentMonday = weekStartYmd(today);
  // Horizonte para desviaciones: ~14 sem hacia atrás (3 meses) + 12 adelante.
  const fromMonday = toYmd(addWeeksUTC(ymdToDate(currentMonday)!, -14));
  const fromDate = ymdToDate(fromMonday)!;
  const toDate = addWeeksUTC(ymdToDate(currentMonday)!, 11);

  const matrix = await buildFlowMatrix(tenantId, {
    from: fromDate,
    to: toDate,
    granularity: "week",
  });

  const warn = matrix.warnThreshold ?? 0;
  let redWeek: FlowInsightsDto["redWeek"] = null;
  let min12: FlowInsightsDto["min12"] = null;

  // KPIs de "próximas 12 sem" solo miran desde la semana actual.
  for (let i = 0; i < matrix.balances.length; i++) {
    const weekStart = matrix.columns[i]?.weekStart ?? matrix.columns[i]?.key ?? "";
    if (!weekStart || weekStart < currentMonday) continue;
    const balance = matrix.balances[i] ?? 0;
    if (min12 == null || balance < min12.balance) {
      min12 = { weekStart, balance };
    }
    if (redWeek == null && balance < 0 && balance < warn) {
      redWeek = { weekStart, balance };
    }
  }

  const saldoHoy = matrix.kpis?.saldoHoy ?? null;

  // Candidatos de "Mover a…" (actual + 11 futuras) para filtrar selladas.
  const moveCandidates: string[] = [];
  {
    let w = ymdToDate(currentMonday)!;
    for (let i = 0; i < 12; i++) {
      moveCandidates.push(toYmd(w));
      w = addWeeksUTC(w, 1);
    }
  }

  const [config, dtes, exclusions, overrides, closedMondays] = await Promise.all([
    prisma.financeCashflowConfig.findUnique({
      where: { tenantId },
      select: { collectionLagDays: true, flowCutoffYmd: true },
    }),
    prisma.financeDte.findMany({
      where: {
        tenantId,
        direction: "ISSUED",
        dteType: { in: [33, 34] },
        siiStatus: { in: ["ACCEPTED", "PENDING", "SENT"] },
        voidedByCreditNoteId: null,
        paymentStatus: { in: ["UNPAID", "PARTIAL", "OVERDUE"] },
      },
      select: {
        id: true,
        folio: true,
        date: true,
        dueDate: true,
        totalAmount: true,
        amountPaid: true,
        receiverName: true,
      },
      take: 2000,
    }),
    prisma.financeCashflowDteFlowExclusion.findMany({
      where: { tenantId },
      select: { dteId: true },
    }),
    prisma.financeCashflowDteDateOverride.findMany({
      where: { tenantId },
      select: { dteId: true, customDate: true },
    }),
    listClosedV3Weeks(tenantId, moveCandidates),
  ]);

  const excludedIds = new Set(exclusions.map((e) => e.dteId));
  const overrideByDteId = new Map(
    overrides.map((o) => [o.dteId, o.customDate.toISOString().slice(0, 10)]),
  );
  const lagDays = config?.collectionLagDays ?? DEFAULT_COLLECTION_LAG_DAYS;
  const todayYmd = toYmd(today);
  const sealedMondays = new Set(closedMondays);
  const cutoffYmd = config?.flowCutoffYmd
    ? config.flowCutoffYmd.toISOString().slice(0, 10)
    : null;

  const aging = { alDia: 0, d1_15: 0, d16_30: 0, d30plus: 0 };
  let porCobrarTotal = 0;
  const cartera: CarteraPendienteItem[] = [];

  for (const d of dtes) {
    if (excludedIds.has(d.id)) continue;
    const issue = d.date.toISOString().slice(0, 10);
    if (cutoffYmd && issue < cutoffYmd) continue;
    const pending = Number(d.totalAmount) - Number(d.amountPaid ?? 0);
    if (pending <= 0) continue;
    porCobrarTotal += pending;

    const dueYmd = d.dueDate
      ? d.dueDate.toISOString().slice(0, 10)
      : addDaysYmd(issue, lagDays);
    const overdueDays = daysBetween(dueYmd, todayYmd);
    // Aging del panel: por días desde emisión (histórico del KPI).
    const daysSinceIssue = daysBetween(issue, todayYmd);
    if (daysSinceIssue <= 0) aging.alDia += pending;
    else if (daysSinceIssue <= 15) aging.d1_15 += pending;
    else if (daysSinceIssue <= 30) aging.d16_30 += pending;
    else aging.d30plus += pending;

    const placementYmd = overrideByDteId.get(d.id) ?? issue;
    const anchoredWeek = weekStartYmd(ymdToDate(placementYmd) ?? d.date);
    cartera.push({
      dteId: d.id,
      folio: d.folio,
      receiverName: d.receiverName,
      issueDate: issue,
      dueDate: dueYmd,
      overdueDays,
      pendingClp: Math.round(pending),
      anchoredWeek,
      anchoredWeekLabel: weekLabel(anchoredWeek),
    });
  }

  cartera.sort((a, b) => b.overdueDays - a.overdueDays || b.pendingClp - a.pendingClp);

  const openMoveWeeks: OpenMoveWeek[] = moveCandidates
    .filter((ws) => !sealedMondays.has(ws))
    .map((ws) => ({ weekStart: ws, label: weekLabel(ws) }));

  const seals = await prisma.financeCashflowWeeklyClose.findMany({
    where: { tenantId },
    orderBy: { weekEndDate: "desc" },
    take: 3,
    select: {
      weekEndDate: true,
      bankBalanceClp: true,
      forcedBalanceClp: true,
      isManual: true,
      projectedBalanceClp: true,
    },
  });

  const recentSeals = seals.map((s) => {
    const closed = Number(
      s.isManual && s.forcedBalanceClp != null ? s.forcedBalanceClp : s.bankBalanceClp,
    );
    const projected = Number(s.projectedBalanceClp ?? 0);
    return {
      weekEnd: s.weekEndDate.toISOString().slice(0, 10),
      closedBalance: closed,
      projectedBalance: projected,
      delta: closed - projected,
    };
  });

  // Desviaciones mensuales: agrega celdas con real de filas clave
  // (últimos 3 meses cerrados + mes actual del horizonte de matriz).
  const todayMonth = todayYmd.slice(0, 7);
  const monthKeys: string[] = [];
  {
    const [y, m] = todayMonth.split("-").map(Number);
    for (let i = 3; i >= 0; i--) {
      let mm = m - i;
      let yy = y;
      while (mm <= 0) {
        mm += 12;
        yy -= 1;
      }
      monthKeys.push(`${yy}-${String(mm).padStart(2, "0")}`);
    }
  }

  const monthlyDrifts: MonthlyDriftRow[] = [];
  for (const row of matrix.rows) {
    if (!isDriftKeyRow(row.name)) continue;
    const byMonth = new Map<string, { projected: number; real: number }>();
    for (const mk of monthKeys) byMonth.set(mk, { projected: 0, real: 0 });
    for (const cell of row.cells) {
      const mk = cell.weekStart.slice(0, 7);
      const bucket = byMonth.get(mk);
      if (!bucket) continue;
      const realMag = cell.real ? Math.abs(cell.real.total) : 0;
      const projMag =
        cell.projected != null
          ? cell.projected
          : cell.plan !== 0
            ? Math.abs(cell.plan)
            : Math.abs(cell.committed?.total ?? 0);
      if (realMag > 0 || cell.drift) {
        bucket.real += realMag;
        bucket.projected += projMag;
      } else if (projMag > 0 && mk === todayMonth && cell.weekStart >= currentMonday) {
        bucket.projected += projMag;
      }
    }
    monthlyDrifts.push({
      rowId: row.id,
      name: row.name,
      months: monthKeys.map((mk) => {
        const b = byMonth.get(mk)!;
        return {
          monthKey: mk,
          projected: Math.round(b.projected),
          real: Math.round(b.real),
          delta: Math.round(b.real - b.projected),
        };
      }),
    });
  }

  return {
    saldoHoy,
    redWeek,
    min12,
    porCobrarTotal,
    aging,
    cartera,
    openMoveWeeks,
    balanceSeries: matrix.columns
      .map((c, i) => ({
        weekStart: c.weekStart,
        label: c.label,
        balance: matrix.balances[i] ?? 0,
      }))
      .filter((c) => c.weekStart >= currentMonday),
    recentSeals,
    warnThresholdClp: warn,
    monthlyDrifts,
  };
}
