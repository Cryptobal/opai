import { describe, it, expect } from "vitest";
import {
  buildPanelWeeks,
  derivePanelKpis,
  buildTopMovers,
  buildIntegrity,
} from "../insights-series";
import type { FlowMatrixRowDto } from "../matrix-assemble";
import type { MatrixColumn } from "../matrix-monthly";

const CURRENT = "2026-08-03";
const BUFFER = 8_000_000;

function col(weekStart: string, label: string): MatrixColumn {
  return {
    key: weekStart,
    label,
    monthKey: weekStart.slice(0, 7),
    weekStart,
    isCurrent: weekStart === CURRENT,
    isPast: weekStart < CURRENT,
    weekCount: 1,
  };
}

function cell(weekStart: string, effective: number) {
  return {
    weekStart,
    plan: 0,
    committed: null,
    real: null,
    effective,
    layer: "plan" as const,
  };
}

function row(
  id: string,
  name: string,
  effectives: Record<string, number>,
  weeks: string[],
): FlowMatrixRowDto {
  return {
    id,
    name,
    section: "GAV",
    sortOrder: 0,
    crmAccountId: null,
    installationId: null,
    categoryId: null,
    supplierId: null,
    isArchived: false,
    archivedWeekCutoff: null,
    isVirtual: false,
    cells: weeks.map((w) => cell(w, effectives[w] ?? 0)),
  };
}

describe("buildPanelWeeks", () => {
  const weeks = ["2026-07-20", "2026-07-27", CURRENT, "2026-08-10"];
  const columns = weeks.map((w, i) => col(w, `S${30 + i}`));

  it("marca sealed con precedencia sobre past", () => {
    const rows = [
      row("fin", "Créditos", { "2026-07-20": 1_000_000, "2026-07-27": -500_000 }, weeks),
    ];
    const points = buildPanelWeeks({
      columns,
      balances: [10_000_000, 9_500_000, 9_000_000, 8_500_000],
      rows,
      closedWeeks: ["2026-07-20"],
      balanceAnchors: { "2026-07-27": 9_500_000 },
      balanceBreaks: [null, { vsWeek: "2026-07-20", delta: 100 }, null, null],
      currentWeek: CURRENT,
    });
    expect(points[0]!.kind).toBe("sealed");
    expect(points[0]!.sealed).toBe(true);
    expect(points[1]!.kind).toBe("past");
    expect(points[1]!.anchored).toBe(true);
    expect(points[1]!.breakDelta).toBe(100);
    expect(points[2]!.kind).toBe("current");
    expect(points[3]!.kind).toBe("projected");
    expect(points[0]!.inflow).toBe(1_000_000);
    expect(points[1]!.outflow).toBe(-500_000);
    expect(points[0]!.weekEnd).toBe("2026-07-26");
  });

  it("suma inflow/outflow con filas de FINANCIAMIENTO signadas", () => {
    const rows = [
      row("apo", "Aporte", { [CURRENT]: 2_000_000 }, weeks),
      row("ret", "Retiro", { [CURRENT]: -800_000 }, weeks),
    ];
    const points = buildPanelWeeks({
      columns,
      balances: [0, 0, 1_200_000, 1_200_000],
      rows,
      closedWeeks: [],
      balanceBreaks: [null, null, null, null],
      currentWeek: CURRENT,
    });
    const cur = points.find((p) => p.weekStart === CURRENT)!;
    expect(cur.inflow).toBe(2_000_000);
    expect(cur.outflow).toBe(-800_000);
    expect(cur.net).toBe(1_200_000);
  });
});

describe("derivePanelKpis", () => {
  function makeWeeks(balances: number[]) {
    // current + 11 futuras = 12
    const starts: string[] = [];
    let d = Date.parse(`${CURRENT}T00:00:00Z`);
    for (let i = 0; i < balances.length; i++) {
      starts.push(new Date(d).toISOString().slice(0, 10));
      d += 7 * 86_400_000;
    }
    return starts.map((ws, i) => ({
      weekStart: ws,
      weekEnd: new Date(Date.parse(`${ws}T00:00:00Z`) + 6 * 86_400_000)
        .toISOString()
        .slice(0, 10),
      label: `S${i}`,
      balance: balances[i]!,
      inflow: 0,
      outflow: 0,
      net: 0,
      kind: (i === 0 ? "current" : "projected") as const,
      sealed: false,
      anchored: false,
      breakDelta: null,
    }));
  }

  it("colchón positivo con saldo positivo bajo colchón → below_buffer", () => {
    const weeks = makeWeeks([
      10_000_000, 9_000_000, 7_000_000, 6_000_000,
      5_000_000, 5_000_000, 5_000_000, 5_000_000,
      5_000_000, 5_000_000, 5_000_000, 5_000_000,
    ]);
    const kpis = derivePanelKpis(weeks, { currentWeek: CURRENT, buffer: BUFFER });
    expect(kpis.firstBreach).not.toBeNull();
    expect(kpis.firstBreach!.type).toBe("below_buffer");
    expect(kpis.firstBreach!.balance).toBe(7_000_000);
    expect(kpis.firstBreach!.gapToBuffer).toBe(1_000_000);
    expect(kpis.firstNegative).toBeNull();
    expect(kpis.runwayWeeks).toBe(2);
  });

  it("serie enteramente sobre el colchón", () => {
    const weeks = makeWeeks(Array(12).fill(12_000_000));
    const kpis = derivePanelKpis(weeks, { currentWeek: CURRENT, buffer: BUFFER });
    expect(kpis.firstBreach).toBeNull();
    expect(kpis.runwayWeeks).toBe(12);
    expect(kpis.weeksBelowBuffer).toBe(0);
  });

  it("semana actual ya bajo colchón → runwayWeeks === 0", () => {
    const weeks = makeWeeks([
      3_000_000, 2_000_000, -1_000_000, -2_000_000,
      -2_000_000, -2_000_000, -2_000_000, -2_000_000,
      -2_000_000, -2_000_000, -2_000_000, -2_000_000,
    ]);
    const kpis = derivePanelKpis(weeks, { currentWeek: CURRENT, buffer: BUFFER });
    expect(kpis.runwayWeeks).toBe(0);
    expect(kpis.firstBreach!.type).toBe("below_buffer");
    expect(kpis.firstNegative!.balance).toBe(-1_000_000);
    expect(kpis.min12!.balance).toBe(-2_000_000);
  });

  it("buffer 0: firstBreach colapsa a firstNegative", () => {
    const weeks = makeWeeks([1_000_000, 500_000, -100, -200]);
    const kpis = derivePanelKpis(weeks, { currentWeek: CURRENT, buffer: 0 });
    expect(kpis.firstBreach!.type).toBe("negative");
    expect(kpis.firstBreach!.weekStart).toBe(kpis.firstNegative!.weekStart);
  });
});

describe("buildTopMovers", () => {
  it("top egresos e ingresos en horizonte", () => {
    const weeks = ["2026-08-03", "2026-08-10", "2026-08-17", "2026-08-24"];
    const points = weeks.map((ws, i) => ({
      weekStart: ws,
      weekEnd: ws,
      label: `S${i}`,
      balance: 0,
      inflow: 0,
      outflow: 0,
      net: 0,
      kind: "projected" as const,
      sealed: false,
      anchored: false,
      breakDelta: null,
    }));
    const rows = [
      row("a", "Sueldos", { "2026-08-03": -5_000_000, "2026-08-10": -5_000_000 }, weeks),
      row("b", "IVA", { "2026-08-17": -1_000_000 }, weeks),
      row("c", "Cobros", { "2026-08-03": 3_000_000, "2026-08-24": 2_000_000 }, weeks),
      row("d", "Pequeño", { "2026-08-10": -100 }, weeks),
    ];
    const movers = buildTopMovers(rows, points, { fromWeek: "2026-08-03", count: 4 });
    expect(movers.outflow[0]!.name).toBe("Sueldos");
    expect(movers.outflow[0]!.amount).toBe(10_000_000);
    expect(movers.inflow[0]!.name).toBe("Cobros");
    expect(movers.inflow[0]!.amount).toBe(5_000_000);
  });
});

describe("buildIntegrity", () => {
  it("bankStale cuando cartola > 7 días", () => {
    const h = buildIntegrity({
      todayYmd: "2026-08-10",
      bankAsOfYmd: "2026-07-30",
      accounts: 2,
      sealedWeeks: 3,
      balanceBreaks: 1,
      unroutedIncome: { count: 2, totalClp: 50_000 },
      assignPending: 4,
    });
    expect(h.bankStaleDays).toBe(11);
    expect(h.bankStale).toBe(true);
    expect(h.accounts).toBe(2);
  });
});
