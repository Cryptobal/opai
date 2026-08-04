/**
 * v5.2 — base de ventas por fecha de emisión (IVA F29 futuro + retiro).
 *
 * Reemplaza el proxy de cobros/semanas: emitidos 33/34 (− NC 61) +
 * borradores/programados con issueYmd en el período, sin doble conteo.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const findManyDte = vi.fn();
const findManyExclusion = vi.fn();
const findManyTemplate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    financeDte: { findMany: (...a: unknown[]) => findManyDte(...a) },
    financeCashflowDteFlowExclusion: {
      findMany: (...a: unknown[]) => findManyExclusion(...a),
    },
    financeDteRecurringTemplate: {
      findMany: (...a: unknown[]) => findManyTemplate(...a),
    },
    financeCashflowConfig: { findUnique: vi.fn(async () => null) },
  },
}));
vi.mock("@/lib/uf", () => ({ getUfValue: vi.fn(async () => null) }));
vi.mock("@/modules/finance/billing/f29.service", () => ({
  computeF29Period: vi.fn(),
}));
vi.mock("../plan.service", () => ({
  loadPlanCells: vi.fn(async () => new Map()),
}));
vi.mock("../load-real", () => ({ loadReal: vi.fn(async () => new Map()) }));

import {
  grossToNetSalesClp,
  sumEmissionNetSalesForPeriod,
  sumIncomeFlowForMonth,
  sumProjectedVentasNetasForPeriod,
} from "../load-committed-expense-params";
import type { FlowRowRef } from "../types";

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

type DteWhere = {
  siiStatus?: string | { in?: string[]; notIn?: string[] };
  recurringTemplateId?: unknown;
  dteType?: { in?: number[] };
};

let issuedRows: unknown[] = [];
let draftRows: unknown[] = [];
let linkedRows: unknown[] = [];

function installDteRouter() {
  findManyDte.mockImplementation(async (args: { where?: DteWhere }) => {
    const w = args?.where ?? {};
    if (w.siiStatus === "DRAFT") return draftRows;
    if (w.recurringTemplateId != null && typeof w.recurringTemplateId === "object") {
      return linkedRows;
    }
    // Emitidos del período (ACCEPTED|PENDING|SENT).
    return issuedRows;
  });
}

beforeEach(() => {
  findManyDte.mockReset();
  findManyExclusion.mockReset();
  findManyTemplate.mockReset();
  findManyExclusion.mockResolvedValue([]);
  findManyTemplate.mockResolvedValue([]);
  issuedRows = [];
  draftRows = [];
  linkedRows = [];
  installDteRouter();
});

describe("grossToNetSalesClp", () => {
  it("33 → ÷1.19; 34 → bruto", () => {
    expect(grossToNetSalesClp(1_190_000, 33)).toBe(1_000_000);
    expect(grossToNetSalesClp(500_000, 34)).toBe(500_000);
    expect(grossToNetSalesClp(0, 33)).toBe(0);
  });
});

describe("sumEmissionNetSalesForPeriod — v5.2", () => {
  it("mezcla emitido real + borrador del período", async () => {
    issuedRows = [
      { id: "dte-1", netAmount: 5_000_000, totalAmount: 5_950_000, dteType: 33 },
    ];
    draftRows = [
      {
        id: "draft-1",
        totalAmount: 1_190_000,
        dteType: 33,
        recurringTemplateId: "tpl-1",
        billingPeriod: "2026-09",
      },
    ];
    linkedRows = [
      {
        id: "draft-1",
        recurringTemplateId: "tpl-1",
        billingPeriod: "2026-09",
        siiStatus: "DRAFT",
      },
    ];

    const net = await sumEmissionNetSalesForPeriod("t1", "2026-09");
    expect(net).toBe(6_000_000);
  });

  it("borrador ya emitido no doble cuenta (solo el DTE emitido)", async () => {
    issuedRows = [
      {
        id: "dte-issued",
        netAmount: 2_000_000,
        totalAmount: 2_380_000,
        dteType: 33,
      },
    ];
    linkedRows = [
      {
        id: "dte-issued",
        recurringTemplateId: "tpl-1",
        billingPeriod: "2026-09",
        siiStatus: "ACCEPTED",
      },
    ];
    findManyTemplate.mockResolvedValue([
      {
        id: "tpl-1",
        frequency: "monthly",
        dayOfMonth: 5,
        dayOfWeek: null,
        monthOfYear: null,
        startDate: new Date("2026-01-05T00:00:00.000Z"),
        endDate: null,
        lastRunAt: new Date("2026-08-05T00:00:00.000Z"),
        nextRunAt: new Date("2026-09-05T00:00:00.000Z"),
        facturaTiming: "MISMO_DIA",
        facturaDay: null,
        facturaMesRelativo: "MISMO_MES",
        currency: "CLP",
        lines: [{ quantity: 1, unitPrice: 2_000_000 }],
        dteType: 33,
      },
    ]);

    const net = await sumEmissionNetSalesForPeriod("t1", "2026-09");
    expect(net).toBe(2_000_000);
  });

  it("período futuro puro: solo proyección scheduled", async () => {
    findManyTemplate.mockResolvedValue([
      {
        id: "tpl-fut",
        frequency: "monthly",
        dayOfMonth: 10,
        dayOfWeek: null,
        monthOfYear: null,
        startDate: new Date("2026-01-10T00:00:00.000Z"),
        endDate: null,
        lastRunAt: new Date("2026-10-10T00:00:00.000Z"),
        nextRunAt: new Date("2026-11-10T00:00:00.000Z"),
        facturaTiming: "MISMO_DIA",
        facturaDay: null,
        facturaMesRelativo: "MISMO_MES",
        currency: "CLP",
        lines: [{ quantity: 1, unitPrice: 1_000_000 }],
        dteType: 33,
      },
    ]);

    const net = await sumEmissionNetSalesForPeriod("t1", "2026-11");
    expect(net).toBe(1_000_000);
  });

  it("NC 61 del período netea la base emitida", async () => {
    issuedRows = [
      { id: "f1", netAmount: 10_000_000, totalAmount: 11_900_000, dteType: 33 },
      { id: "nc1", netAmount: 1_000_000, totalAmount: 1_190_000, dteType: 61 },
    ];
    const net = await sumEmissionNetSalesForPeriod("t1", "2026-08");
    expect(net).toBe(9_000_000);
  });

  it("exclusión de flujo omite el DTE emitido", async () => {
    findManyExclusion.mockResolvedValue([{ dteId: "skip-me" }]);
    issuedRows = [
      { id: "skip-me", netAmount: 8_000_000, totalAmount: 9_520_000, dteType: 33 },
      { id: "keep", netAmount: 1_000_000, totalAmount: 1_190_000, dteType: 33 },
    ];
    const net = await sumEmissionNetSalesForPeriod("t1", "2026-08");
    expect(net).toBe(1_000_000);
  });

  it("no depende de weeks.filter (firma conserva args pero ignora weeks)", async () => {
    issuedRows = [
      { id: "d1", netAmount: 3_000_000, totalAmount: 3_570_000, dteType: 33 },
    ];
    const emptyWeeks: string[] = [];
    const a = await sumProjectedVentasNetasForPeriod(
      "t1", ROWS, emptyWeeks, "2026-07-21", "2026-09",
    );
    const b = await sumIncomeFlowForMonth(
      "t1", ROWS, emptyWeeks, "2026-07-21", 2026, 8,
    );
    expect(a).toBe(3_000_000);
    expect(b).toBe(3_000_000);
  });
});
