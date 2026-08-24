import { describe, it, expect } from "vitest";
import { assembleMatrix, type AssembleRowInput } from "../matrix-assemble";
import { weeklyColumns } from "../matrix-monthly";
import {
  flowOverviewHorizon,
  formatFlowOverview,
  overviewColumnIndices,
  toFlowOverviewDto,
} from "../flow-overview";
import { defaultHorizon, toYmd } from "../weeks";
import type { FlowMatrixResponse } from "../matrix-types";
import type { CommittedByRow, RealByRow } from "../types";

const CURRENT = "2026-08-24";
const WEEKS = [
  "2026-07-27",
  "2026-08-03",
  "2026-08-10",
  "2026-08-17",
  "2026-08-24",
  "2026-08-31",
];

function row(over: Partial<AssembleRowInput>): AssembleRowInput {
  return {
    id: "r1",
    name: "Fila",
    section: "INGRESOS",
    mapping: "MANUAL",
    orderIndex: 0,
    crmAccountId: null,
    installationId: null,
    categoryId: null,
    supplierId: null,
    isArchived: false,
    archivedWeekCutoff: null,
    isVirtual: false,
    ...over,
  };
}

function matrixFromAssemble(
  opening: number,
  plan: Map<string, Map<string, number>>,
  committed: CommittedByRow = new Map(),
  real: RealByRow = new Map(),
): FlowMatrixResponse {
  const assembled = assembleMatrix({
    rows: [row({ id: "ing", name: "Cliente X" })],
    weeks: WEEKS,
    currentWeek: CURRENT,
    openingBalance: opening,
    plan,
    committed,
    real,
  });
  return {
    granularity: "week",
    columns: weeklyColumns(WEEKS, CURRENT),
    currentWeek: CURRENT,
    todayYmd: "2026-08-24",
    openingBalance: opening,
    openingBalanceDetail: { totalClp: opening, perAccount: [], lastSnapshotYmd: null },
    closedWeeks: [],
    warnThreshold: 8_000_000,
    rows: assembled.rows,
    flows: assembled.flows,
    balances: assembled.balances,
    balanceBreaks: assembled.balanceBreaks,
    excludedIncome: [],
    unroutedIncome: { count: 0, totalClp: 0 },
    kpis: assembled.kpis,
  };
}

describe("flowOverviewHorizon", () => {
  it("es el mismo horizonte que la planilla (defaultHorizon)", () => {
    const today = new Date("2026-08-24T16:00:00.000Z"); // lun 24 mediodía Chile
    const a = flowOverviewHorizon(today);
    const b = defaultHorizon(today);
    expect(toYmd(a.from)).toBe(toYmd(b.from));
    expect(toYmd(a.to)).toBe(toYmd(b.to));
    // S35 lunes 24-ago − 4 sem = lunes 27-jul
    expect(toYmd(a.from)).toBe("2026-07-27");
  });

  it("no adelanta la ventana cuando UTC ya es lunes y Chile sigue domingo", () => {
    // El MCP viejo usaba weekStartYmd(new Date()) → S35; la planilla sigue en S34.
    const utcMondayChileSunday = new Date("2026-08-24T03:00:00.000Z");
    const a = flowOverviewHorizon(utcMondayChileSunday);
    expect(toYmd(a.from)).toBe("2026-07-20"); // S34 (17-ago) − 4 sem
  });
});

describe("overviewColumnIndices", () => {
  it("incluye la semana previa + actual + 11 futuras", () => {
    const cols = WEEKS.map((w) => ({ weekStart: w }));
    expect(overviewColumnIndices(cols, CURRENT, 1, 11)).toEqual([3, 4, 5]);
  });

  it("si la ventana arranca en la semana actual, no inventa S−1", () => {
    const cols = ["2026-08-24", "2026-08-31"].map((w) => ({ weekStart: w }));
    expect(overviewColumnIndices(cols, CURRENT, 1, 11)).toEqual([0, 1]);
  });
});

describe("toFlowOverviewDto / formatFlowOverview", () => {
  it("Saldo acumulado S actual = Banco hoy + pending; futuras arrastran effective", () => {
    const opening = 24_786_161;
    const pendingS35 = 21_161_862;
    const flujoS36 = -5_000_000;
    const m = matrixFromAssemble(
      opening,
      new Map([["ing", new Map([["2026-08-31", flujoS36]])]]),
      new Map([
        [
          "ing",
          new Map([
            [
              CURRENT,
              {
                total: pendingS35,
                items: [
                  {
                    kind: "dte" as const,
                    folio: 1,
                    dteId: "d",
                    label: "X",
                    fecha: CURRENT,
                    monto: pendingS35,
                  },
                ],
              },
            ],
          ]),
        ],
      ]),
    );
    const dto = toFlowOverviewDto(m);
    expect(dto.todayYmd).toBe("2026-08-24");
    expect(dto.currentWeek).toBe(CURRENT);
    expect(dto.horizon).toEqual({ from: "2026-07-27", to: "2026-08-31" });
    expect(dto.kpis.bancoHoy).toBe(opening);
    expect(dto.kpis.saldoHoy).toBe(opening);
    expect(dto.kpis.openingBalance).toBe(opening);

    const s34 = dto.weeks.find((w) => w.weekStart === "2026-08-17");
    const s35 = dto.weeks.find((w) => w.weekStart === CURRENT);
    const s36 = dto.weeks.find((w) => w.weekStart === "2026-08-31");
    expect(s35?.isCurrent).toBe(true);
    expect(s35?.flujoSemana).toBe(pendingS35);
    expect(s35?.saldoAcumulado).toBe(opening + pendingS35);
    expect(s36?.flujoSemana).toBe(flujoS36);
    expect(s36?.saldoAcumulado).toBe((s35?.saldoAcumulado ?? 0) + flujoS36);
    expect(s34?.isPast).toBe(true);
  });

  it("el texto usa «Saldo acumulado» y «Banco hoy», no solo apertura genérica", () => {
    const m = matrixFromAssemble(10_000_000, new Map());
    const text = formatFlowOverview(m);
    expect(text).toContain("Banco hoy");
    expect(text).toContain("Saldo acumulado:");
    expect(text).toContain("Flujo semana:");
    expect(text).toContain("10000000");
  });
});
