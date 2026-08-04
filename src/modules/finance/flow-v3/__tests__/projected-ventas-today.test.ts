/**
 * v5.1 — arrastre multi-mes de ventas proyectadas.
 *
 * Causa: sumProjectedVentasNetasForPeriod / sumIncomeFlowForMonth pasaban
 * `todayYmd = fin del mes objetivo` a loadCommittedIncome → clamp de
 * borradores/programados previos dentro del mes M.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    financeDte: { findMany: vi.fn(async () => []) },
    financeCashflowConfig: { findUnique: vi.fn(async () => null) },
  },
}));
vi.mock("@/modules/finance/billing/f29.service", () => ({
  computeF29Period: vi.fn(),
}));
vi.mock("../plan.service", () => ({
  loadPlanCells: vi.fn(async () => new Map()),
}));
vi.mock("../load-real", () => ({ loadReal: vi.fn(async () => new Map()) }));

const loadCommittedIncome = vi.fn();
vi.mock("../load-committed-income", () => ({
  loadCommittedIncome: (...args: unknown[]) => loadCommittedIncome(...args),
}));

import { deriveCommittedIncome } from "../derive-committed-income";
import {
  sumIncomeFlowForMonth,
  sumProjectedVentasNetasForPeriod,
} from "../load-committed-expense-params";
import type { FlowRowRef } from "../types";
import { enumerateWeeks } from "../weeks";

const REAL_TODAY = "2026-07-21"; // semana actual = 2026-07-20
const ROWS: FlowRowRef[] = [
  {
    id: "row-a",
    section: "INGRESOS",
    crmAccountId: "acc-A",
    installationId: null,
    categoryId: null,
    name: "Cliente A",
  },
];
const HORIZON = enumerateWeeks(
  new Date(Date.UTC(2026, 4, 1)),
  new Date(Date.UTC(2026, 10, 30)),
);

beforeEach(() => {
  loadCommittedIncome.mockReset();
  loadCommittedIncome.mockResolvedValue({ committed: new Map(), excluded: [] });
});

describe("arrastre multi-mes — clamp con todayYmd falso (causa raíz)", () => {
  it("con hoy = fin de septiembre, un borrador de mayo cae en semanas de septiembre", () => {
    const septWeeks = HORIZON.filter((w) => w.startsWith("2026-09"));
    const fakeToday = "2026-09-28"; // fin del mes objetivo (bug pre-v5.1)
    const out = deriveCommittedIncome({
      rows: ROWS,
      weeks: septWeeks,
      todayYmd: fakeToday,
      dtes: [],
      drafts: [{
        id: "draft-may",
        templateId: "tpl-1",
        dateYmd: "2026-05-10",
        totalClp: 11_900_000,
        receiverName: "Cliente A",
        crmAccountId: "acc-A",
        installationId: null,
        templateEndDateYmd: null,
      }],
      templates: [],
      coveredPeriods: new Set(),
    });
    const currentWeekInSept = "2026-09-28"; // lunes de la semana del 28-sep
    // El clamp mueve el borrador a la "semana actual" del hoy falso → dentro de sept.
    let total = 0;
    for (const w of septWeeks) total += out.get("row-a")?.get(w)?.total ?? 0;
    expect(total).toBe(11_900_000);
    expect(out.get("row-a")?.get(currentWeekInSept)?.total).toBe(11_900_000);
  });

  it("con hoy real (julio), el mismo borrador NO aparece en semanas de septiembre", () => {
    const septWeeks = HORIZON.filter((w) => w.startsWith("2026-09"));
    const out = deriveCommittedIncome({
      rows: ROWS,
      weeks: septWeeks,
      todayYmd: REAL_TODAY,
      dtes: [],
      drafts: [{
        id: "draft-may",
        templateId: "tpl-1",
        dateYmd: "2026-05-10",
        totalClp: 11_900_000,
        receiverName: "Cliente A",
        crmAccountId: "acc-A",
        installationId: null,
        templateEndDateYmd: null,
      }],
      templates: [],
      coveredPeriods: new Set(),
    });
    // Clamp va a 2026-07-20, fuera de septWeeks → 0 en septiembre.
    let total = 0;
    for (const w of septWeeks) total += out.get("row-a")?.get(w)?.total ?? 0;
    expect(total).toBe(0);
  });
});

describe("sumProjectedVentasNetasForPeriod / sumIncomeFlowForMonth — todayYmd real", () => {
  it("pasa el hoy real (no el fin del mes) a loadCommittedIncome", async () => {
    await sumProjectedVentasNetasForPeriod(
      "t1", ROWS, HORIZON, REAL_TODAY, "2026-09",
    );
    expect(loadCommittedIncome).toHaveBeenCalled();
    const todayArg = loadCommittedIncome.mock.calls[0]![3] as string;
    expect(todayArg).toBe(REAL_TODAY);
    // Regresión: nunca debe usar el fin del mes objetivo como hoy.
    expect(todayArg).not.toBe("2026-09-28");
    expect(todayArg.startsWith("2026-09")).toBe(false);
  });

  it("sumIncomeFlowForMonth también threadéa el hoy real", async () => {
    await sumIncomeFlowForMonth("t1", ROWS, HORIZON, REAL_TODAY, 2026, 8); // sep
    const todayArg = loadCommittedIncome.mock.calls[0]![3] as string;
    expect(todayArg).toBe(REAL_TODAY);
  });

  it("mes futuro solo suma su propia venta (sin arrastre del mock de meses previos)", async () => {
    // Simula loadCommittedIncome: con hoy real, semanas de sept no reciben clamp previo.
    loadCommittedIncome.mockImplementation(
      async (_t: string, _r: FlowRowRef[], monthWeeks: string[], todayYmd: string) => {
        const committed = new Map<string, Map<string, { total: number; items: [] }>>();
        const byWeek = new Map<string, { total: number; items: [] }>();
        // Solo si el hoy falso está en el mes, "arrastra" 11.9M a la semana actual.
        const currentWeek = todayYmd.slice(0, 8) === monthWeeks[0]?.slice(0, 8)
          || monthWeeks.some((w) => w <= todayYmd && todayYmd < w.slice(0, 8) + "32");
        // Coloca venta propia del mes (3M) en la primera semana.
        if (monthWeeks[0]) byWeek.set(monthWeeks[0], { total: 3_570_000, items: [] });
        // Arrastre compuesto solo si todayYmd cae dentro del mes filtrado.
        const todayInMonth = monthWeeks.some((w) => w.startsWith(todayYmd.slice(0, 7)));
        if (todayInMonth) {
          const cw = monthWeeks.find((w) => w <= todayYmd) ?? monthWeeks[monthWeeks.length - 1]!;
          byWeek.set(cw, { total: (byWeek.get(cw)?.total ?? 0) + 11_900_000, items: [] });
        }
        void currentWeek;
        committed.set("row-a", byWeek);
        return { committed, excluded: [] };
      },
    );

    const septNet = await sumProjectedVentasNetasForPeriod(
      "t1", ROWS, HORIZON, REAL_TODAY, "2026-09",
    );
    // Solo 3.57M / 1.19 = 3_000_000 — sin el arrastre de 11.9M.
    expect(septNet).toBe(3_000_000);

    const septWithFakeToday = await sumProjectedVentasNetasForPeriod(
      "t1", ROWS, HORIZON, "2026-09-28", "2026-09",
    );
    // Con hoy falso (bug) incluiría el arrastre → ~12.6M netas.
    expect(septWithFakeToday).toBeGreaterThan(septNet);
    expect(septWithFakeToday).toBe(Math.round((3_570_000 + 11_900_000) / 1.19));
  });
});
