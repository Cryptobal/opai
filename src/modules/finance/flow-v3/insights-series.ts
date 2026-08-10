/**
 * Derivación pura de la serie del Panel de flujo de caja.
 * Sin Prisma / server-only: recibe la matriz ya cargada.
 */
import { addDaysYmd } from "./types";
import type { BalanceBreak, FlowMatrixRowDto } from "./matrix-assemble";
import type { MatrixColumn } from "./matrix-monthly";

export type PanelWeekKind = "sealed" | "past" | "current" | "projected";

export interface PanelWeekPoint {
  weekStart: string;
  weekEnd: string;
  label: string;
  balance: number;
  inflow: number;
  outflow: number;
  net: number;
  kind: PanelWeekKind;
  sealed: boolean;
  anchored: boolean;
  breakDelta: number | null;
}

export interface PanelBreach {
  weekStart: string;
  balance: number;
  type: "below_buffer" | "negative";
  /** Distancia al colchón (positiva = cuánto falta para llegar al colchón). */
  gapToBuffer: number;
}

export interface PanelKpisDerived {
  firstBreach: PanelBreach | null;
  firstNegative: { weekStart: string; balance: number } | null;
  min12: { weekStart: string; balance: number } | null;
  runwayWeeks: number;
  weeksBelowBuffer: number;
  endOfHorizon: { weekStart: string; balance: number } | null;
}

export interface PanelMover {
  rowId: string;
  name: string;
  amount: number;
}

export interface PanelTopMovers {
  horizonWeeks: number;
  inflow: PanelMover[];
  outflow: PanelMover[];
}

export interface PanelDataHealth {
  bankAsOfYmd: string | null;
  bankStaleDays: number | null;
  bankStale: boolean;
  /** Solo el número de cuentas — sin perAccount ni números de cuenta. */
  accounts: number;
  sealedWeeks: number;
  balanceBreaks: number;
  unroutedIncome: { count: number; totalClp: number };
  assignPending: number;
  /** true si el fetch de DTEs tocó el take:2000 (posible truncamiento). */
  dteTruncated?: boolean;
}

function daysBetween(fromYmd: string, toYmd: string): number {
  const a = Date.parse(`${fromYmd}T00:00:00Z`);
  const b = Date.parse(`${toYmd}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

export function buildPanelWeeks(args: {
  columns: MatrixColumn[];
  balances: number[];
  rows: FlowMatrixRowDto[];
  closedWeeks: string[];
  balanceAnchors?: Record<string, number>;
  balanceBreaks: Array<BalanceBreak | null>;
  currentWeek: string;
}): PanelWeekPoint[] {
  const closed = new Set(args.closedWeeks);
  const anchors = args.balanceAnchors ?? {};
  const n = args.columns.length;

  return args.columns.map((col, i) => {
    const weekStart = col.weekStart || col.key;
    let inflow = 0;
    let outflow = 0;
    for (const row of args.rows) {
      const cell = row.cells[i];
      if (!cell) continue;
      const eff = cell.effective ?? 0;
      if (eff > 0) inflow += eff;
      else if (eff < 0) outflow += eff;
    }
    inflow = Math.round(inflow);
    outflow = Math.round(outflow);
    const sealed = closed.has(weekStart);
    let kind: PanelWeekKind;
    if (sealed) kind = "sealed";
    else if (weekStart === args.currentWeek) kind = "current";
    else if (weekStart < args.currentWeek) kind = "past";
    else kind = "projected";

    const br = args.balanceBreaks[i] ?? null;
    return {
      weekStart,
      weekEnd: addDaysYmd(weekStart, 6),
      label: col.label,
      balance: Math.round(args.balances[i] ?? 0),
      inflow,
      outflow,
      net: Math.round(inflow + outflow),
      kind,
      sealed,
      anchored: Object.prototype.hasOwnProperty.call(anchors, weekStart),
      breakDelta: br ? Math.round(br.delta) : null,
    };
  }).slice(0, n);
}

export function derivePanelKpis(
  weeks: PanelWeekPoint[],
  opts: { currentWeek: string; buffer: number; saldoHoy?: number | null },
): PanelKpisDerived {
  const ahead = weeks.filter((w) => w.weekStart >= opts.currentWeek);
  const buffer = Math.max(0, opts.buffer);

  let firstBreach: PanelBreach | null = null;
  let firstNegative: { weekStart: string; balance: number } | null = null;
  let min12: { weekStart: string; balance: number } | null = null;
  let weeksBelowBuffer = 0;

  for (const w of ahead) {
    if (min12 == null || w.balance < min12.balance) {
      min12 = { weekStart: w.weekStart, balance: w.balance };
    }
    if (w.balance < 0 && firstNegative == null) {
      firstNegative = { weekStart: w.weekStart, balance: w.balance };
    }
    const belowBuffer = buffer > 0 ? w.balance < buffer : w.balance < 0;
    if (belowBuffer) {
      weeksBelowBuffer += 1;
      if (firstBreach == null) {
        firstBreach = {
          weekStart: w.weekStart,
          balance: w.balance,
          type: w.balance < 0 ? "negative" : "below_buffer",
          gapToBuffer: Math.round(buffer - w.balance),
        };
      }
    }
  }

  // buffer === 0: firstBreach colapsa a firstNegative
  if (buffer === 0 && firstNegative && firstBreach == null) {
    firstBreach = {
      weekStart: firstNegative.weekStart,
      balance: firstNegative.balance,
      type: "negative",
      gapToBuffer: Math.round(-firstNegative.balance),
    };
  }

  let runwayWeeks = 0;
  for (const w of ahead) {
    const ok = buffer > 0 ? w.balance >= buffer : w.balance >= 0;
    if (!ok) break;
    runwayWeeks += 1;
  }

  const last = ahead[ahead.length - 1] ?? null;
  return {
    firstBreach,
    firstNegative,
    min12,
    runwayWeeks,
    weeksBelowBuffer,
    endOfHorizon: last
      ? { weekStart: last.weekStart, balance: last.balance }
      : null,
  };
}

export function buildTopMovers(
  rows: FlowMatrixRowDto[],
  weeks: PanelWeekPoint[],
  opts: { fromWeek: string; count?: number },
): PanelTopMovers {
  const horizon = opts.count ?? 4;
  const windowStarts = weeks
    .filter((w) => w.weekStart >= opts.fromWeek)
    .slice(0, horizon)
    .map((w) => w.weekStart);
  const windowSet = new Set(windowStarts);
  const colIndex = new Map(weeks.map((w, i) => [w.weekStart, i]));

  const movers: PanelMover[] = [];
  for (const row of rows) {
    let sum = 0;
    for (const ws of windowSet) {
      const idx = colIndex.get(ws);
      if (idx == null) continue;
      sum += row.cells[idx]?.effective ?? 0;
    }
    sum = Math.round(sum);
    if (sum === 0) continue;
    movers.push({ rowId: row.id, name: row.name, amount: sum });
  }

  const inflow = movers
    .filter((m) => m.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3);
  const outflow = movers
    .filter((m) => m.amount < 0)
    .sort((a, b) => a.amount - b.amount)
    .slice(0, 6)
    .map((m) => ({ ...m, amount: Math.abs(m.amount) }));

  return { horizonWeeks: horizon, inflow, outflow };
}

export function buildIntegrity(args: {
  todayYmd: string;
  bankAsOfYmd: string | null;
  accounts: number;
  sealedWeeks: number;
  balanceBreaks: number;
  unroutedIncome: { count: number; totalClp: number };
  assignPending: number;
  dteTruncated?: boolean;
}): PanelDataHealth {
  const bankStaleDays =
    args.bankAsOfYmd != null
      ? daysBetween(args.bankAsOfYmd, args.todayYmd)
      : null;
  return {
    bankAsOfYmd: args.bankAsOfYmd,
    bankStaleDays,
    bankStale: bankStaleDays != null ? bankStaleDays > 7 : false,
    accounts: args.accounts,
    sealedWeeks: args.sealedWeeks,
    balanceBreaks: args.balanceBreaks,
    unroutedIncome: {
      count: args.unroutedIncome.count,
      totalClp: Math.round(args.unroutedIncome.totalClp),
    },
    assignPending: args.assignPending,
    dteTruncated: args.dteTruncated,
  };
}
