import { describe, it, expect } from "vitest";
import {
  buildMonthlyDrifts,
  isDriftRow,
  projMag,
} from "../insights-drift";
import type { FlowMatrixCellDto, FlowMatrixRowDto } from "../matrix-assemble";

const CURRENT = "2026-08-10"; // S33 — segunda semana de agosto
const TODAY = "2026-08-12";

function makeCell(
  weekStart: string,
  opts: {
    plan?: number;
    committed?: number;
    real?: number;
    projected?: number | null;
  } = {},
): FlowMatrixCellDto {
  return {
    weekStart,
    plan: opts.plan ?? 0,
    committed:
      opts.committed != null
        ? { total: opts.committed, items: [] }
        : null,
    real:
      opts.real != null ? { total: opts.real, items: [] } : null,
    effective: 0,
    layer: "plan",
    projected: opts.projected,
  };
}

function makeRow(
  id: string,
  name: string,
  cells: FlowMatrixCellDto[],
  canonicalKey?: string | null,
): FlowMatrixRowDto {
  return {
    id,
    name,
    section: "REMUNERACIONES",
    sortOrder: 0,
    crmAccountId: null,
    installationId: null,
    categoryId: null,
    canonicalKey,
    supplierId: null,
    isArchived: false,
    archivedWeekCutoff: null,
    isVirtual: false,
    cells,
  };
}

describe("isDriftRow", () => {
  it("selección por canonicalKey gana sobre nombre", () => {
    expect(isDriftRow({ name: "Foo random", canonicalKey: "SUELDO" })).toBe(true);
    expect(isDriftRow({ name: "Sueldos líquidos", canonicalKey: "BANDEJA_INGRESO" })).toBe(false);
  });

  it("fila renombrada con canonicalKey sigue apareciendo", () => {
    expect(isDriftRow({ name: "Nómina quincenal", canonicalKey: "QUINCENA" })).toBe(true);
    expect(isDriftRow({ name: "Factoring fees", canonicalKey: "FACTORING" })).toBe(true);
  });

  it("fila sin canonicalKey con nombre canónico sigue apareciendo", () => {
    expect(isDriftRow({ name: "Sueldos líquidos", canonicalKey: null })).toBe(true);
    expect(isDriftRow({ name: "Costo factoring", canonicalKey: null })).toBe(true);
  });
});

describe("projMag", () => {
  it("cae a plan / committed cuando no hay projected", () => {
    expect(projMag(makeCell("2026-07-06", { plan: -1_000_000 }))).toBe(1_000_000);
    expect(projMag(makeCell("2026-07-06", { committed: 500_000 }))).toBe(500_000);
    expect(projMag(makeCell("2026-07-06", { projected: 200_000, plan: 999 }))).toBe(200_000);
  });
});

describe("buildMonthlyDrifts", () => {
  const weeks = [
    "2026-06-29", // julio
    "2026-07-06",
    "2026-07-13",
    "2026-07-20",
    "2026-07-27",
    "2026-08-03", // agosto
    "2026-08-10", // current
    "2026-08-17", // futuro
    "2026-08-24",
  ];
  const monthKeys = ["2026-05", "2026-06", "2026-07", "2026-08"];

  it("mes pasado con plan y sin real → projected > 0, real = 0, delta < 0", () => {
    const cells = weeks.map((w) =>
      w.startsWith("2026-07")
        ? makeCell(w, { plan: -2_000_000 })
        : makeCell(w),
    );
    const rows = [makeRow("s", "Sueldos líquidos", cells, "SUELDO")];
    const drifts = buildMonthlyDrifts(rows, {
      monthKeys,
      currentWeek: CURRENT,
      todayYmd: TODAY,
    });
    const jul = drifts[0]!.months.find((m) => m.monthKey === "2026-07")!;
    expect(jul.projected).toBe(8_000_000); // 4 semanas × 2M
    expect(jul.real).toBe(0);
    expect(jul.delta).toBe(-8_000_000);
    expect(jul.partial).toBe(false);
  });

  it("mes pasado con real y sin plan → projected = 0, real > 0", () => {
    const cells = weeks.map((w) =>
      w === "2026-07-13"
        ? makeCell(w, { real: 1_500_000 })
        : makeCell(w),
    );
    const rows = [makeRow("s", "Sueldos", cells, "SUELDO")];
    const drifts = buildMonthlyDrifts(rows, {
      monthKeys,
      currentWeek: CURRENT,
      todayYmd: TODAY,
    });
    const jul = drifts[0]!.months.find((m) => m.monthKey === "2026-07")!;
    expect(jul.projected).toBe(0);
    expect(jul.real).toBe(1_500_000);
    expect(jul.delta).toBe(1_500_000);
  });

  it("mes en curso solo suma semanas iniciadas", () => {
    const cells = weeks.map((w) =>
      w.startsWith("2026-08")
        ? makeCell(w, { plan: -1_000_000 })
        : makeCell(w),
    );
    const rows = [makeRow("s", "Sueldos", cells, "SUELDO")];
    const drifts = buildMonthlyDrifts(rows, {
      monthKeys,
      currentWeek: CURRENT,
      todayYmd: TODAY,
    });
    const ago = drifts[0]!.months.find((m) => m.monthKey === "2026-08")!;
    expect(ago.partial).toBe(true);
    // 2026-08-03 y 2026-08-10 iniciadas; 17 y 24 no
    expect(ago.projected).toBe(2_000_000);
    expect(ago.weeksElapsed).toBe(2);
    expect(ago.weeksTotal).toBe(4);
  });

  it("incluye QUINCENA y FACTORING por canonicalKey", () => {
    const empty = weeks.map((w) => makeCell(w, { plan: 100 }));
    const rows = [
      makeRow("q", "Anticipos custom", empty, "QUINCENA"),
      makeRow("f", "Fee factoring", empty, "FACTORING"),
    ];
    const drifts = buildMonthlyDrifts(rows, {
      monthKeys,
      currentWeek: CURRENT,
      todayYmd: TODAY,
    });
    expect(drifts.map((d) => d.canonicalKey).sort()).toEqual([
      "FACTORING",
      "QUINCENA",
    ]);
  });

  it("marca allZero cuando no hay montos", () => {
    const cells = weeks.map((w) => makeCell(w));
    const rows = [makeRow("s", "Sueldos", cells, "SUELDO")];
    const drifts = buildMonthlyDrifts(rows, {
      monthKeys,
      currentWeek: CURRENT,
      todayYmd: TODAY,
    });
    expect(drifts[0]!.allZero).toBe(true);
  });
});
