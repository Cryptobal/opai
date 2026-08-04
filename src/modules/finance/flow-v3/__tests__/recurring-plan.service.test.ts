import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../plan.service", () => ({
  bulkFill: vi.fn(async () => []),
  upsertCell: vi.fn(async () => ({})),
}));
vi.mock("../weekly-close.adapter", () => ({ listClosedV3Weeks: vi.fn(async () => []) }));
vi.mock("@/lib/uf", () => ({ getUfValueForDate: vi.fn(async () => 39_000) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    financeFlowPlanRecurrence: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    financeFlowRow: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
    financeCashflowCategory: { findFirst: vi.fn() },
    financeCashflowConfig: { findUnique: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { bulkFill } from "../plan.service";
import {
  createRecurrence,
  expandOccurrenceDates,
  updateRecurrence,
} from "../recurring-plan.service";
import { weekStartYmd } from "../weeks";

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe("expandOccurrenceDates", () => {
  it("mensual día 31: se ajusta al último día en meses cortos", () => {
    const out = expandOccurrenceDates("MONTHLY", "2026-01-01", "2026-04-30", 31);
    expect(out).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  });

  it("mensual día 29 en febrero: bisiesto vs no bisiesto", () => {
    expect(expandOccurrenceDates("MONTHLY", "2028-02-01", "2028-02-29", 29)).toEqual(["2028-02-29"]);
    expect(expandOccurrenceDates("MONTHLY", "2026-02-01", "2026-02-28", 29)).toEqual(["2026-02-28"]);
  });

  it("respeta endDate (no genera ocurrencias posteriores)", () => {
    const out = expandOccurrenceDates("MONTHLY", "2026-01-15", "2026-03-14", 15);
    expect(out).toEqual(["2026-01-15", "2026-02-15"]); // 2026-03-15 queda fuera
  });

  it("semanal: paso de 7 días", () => {
    const out = expandOccurrenceDates("WEEKLY", "2026-07-20", "2026-08-10", null);
    expect(out).toEqual(["2026-07-20", "2026-07-27", "2026-08-03", "2026-08-10"]);
  });

  it("quincenal: paso de 14 días", () => {
    const out = expandOccurrenceDates("BIWEEKLY", "2026-07-20", "2026-08-20", null);
    expect(out).toEqual(["2026-07-20", "2026-08-03", "2026-08-17"]);
  });

  it("endDate anterior a startDate ⇒ vacío", () => {
    expect(expandOccurrenceDates("WEEKLY", "2026-07-20", "2026-07-01", null)).toEqual([]);
  });

  it("termina tras N=3 repeticiones mensuales", () => {
    const out = expandOccurrenceDates("MONTHLY", "2026-01-01", "2026-12-31", 1, 3);
    expect(out).toEqual(["2026-01-01", "2026-02-01", "2026-03-01"]);
  });

  it("endDate y N=10: gana el que ocurra primero (endDate)", () => {
    const out = expandOccurrenceDates("MONTHLY", "2026-01-15", "2026-02-20", 15, 10);
    expect(out).toEqual(["2026-01-15", "2026-02-15"]);
  });
});

describe("updateRecurrence — no reescribe el pasado", () => {
  it("solo materializa (bulkFill) semanas ≥ la semana actual", async () => {
    asMock(prisma.financeFlowPlanRecurrence.findFirst).mockResolvedValue({
      id: "rec-1", rowId: "row-1", tenantId: "t1",
      amount: "1000", currency: "CLP", amountUf: null, ufPolicy: null, ufCustomDay: null,
      frequency: "MONTHLY", dayOfMonth: 1,
      startDate: new Date("2020-01-01T00:00:00.000Z"), endDate: null,
    });
    asMock(prisma.financeFlowPlanRecurrence.update).mockResolvedValue({
      id: "rec-1", rowId: "row-1", tenantId: "t1",
      amount: "2000", currency: "CLP", amountUf: null, ufPolicy: null, ufCustomDay: null,
      frequency: "MONTHLY", dayOfMonth: 1,
      startDate: new Date("2020-01-01T00:00:00.000Z"), endDate: null,
    });

    await updateRecurrence("t1", "rec-1", { amount: 2000 }, "u");

    const currentWeek = weekStartYmd(new Date());
    const calls = asMock(bulkFill).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      const weeks = call[2] as string[];
      for (const w of weeks) expect(w >= currentWeek).toBe(true);
    }
  });
});

describe("createRecurrence — Nueva fila con categoría", () => {
  it("crea fila mapping CATEGORY con categoryId del catálogo", async () => {
    asMock(prisma.financeFlowRow.findMany).mockResolvedValue([]);
    asMock(prisma.financeCashflowCategory.findFirst).mockResolvedValue({ id: "cat-1" });
    asMock(prisma.financeFlowRow.findFirst).mockResolvedValue({ orderIndex: 3 });
    asMock(prisma.financeFlowRow.create).mockResolvedValue({ id: "row-new" });
    asMock(prisma.financeFlowPlanRecurrence.create).mockResolvedValue({
      id: "rec-new",
      tenantId: "t1",
      rowId: "row-new",
      amount: "500000",
      currency: "CLP",
      amountUf: null,
      ufPolicy: null,
      ufCustomDay: null,
      frequency: "MONTHLY",
      dayOfMonth: 5,
      startDate: new Date("2026-08-01T00:00:00.000Z"),
      endDate: null,
      endAfterOccurrences: null,
    });

    const result = await createRecurrence(
      "t1",
      null,
      {
        amount: 500_000,
        frequency: "MONTHLY",
        dayOfMonth: 5,
        startDate: "2026-08-01",
        currency: "CLP",
        newRow: {
          section: "GAV",
          name: "Arriendo oficina",
          categoryId: "cat-1",
        },
      },
      "u1",
    );

    expect(asMock(prisma.financeCashflowCategory.findFirst)).toHaveBeenCalledWith({
      where: { id: "cat-1", tenantId: "t1" },
      select: { id: true },
    });
    expect(asMock(prisma.financeFlowRow.create)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: "t1",
          section: "GAV",
          name: "Arriendo oficina",
          mapping: "CATEGORY",
          categoryId: "cat-1",
        }),
      }),
    );
    expect(result.rule.rowId).toBe("row-new");
  });

  it("sin categoryId crea fila MANUAL", async () => {
    asMock(prisma.financeFlowRow.findMany).mockResolvedValue([]);
    asMock(prisma.financeFlowRow.findFirst).mockResolvedValue({ orderIndex: 0 });
    asMock(prisma.financeFlowRow.create).mockResolvedValue({ id: "row-manual" });
    asMock(prisma.financeFlowPlanRecurrence.create).mockResolvedValue({
      id: "rec-m",
      tenantId: "t1",
      rowId: "row-manual",
      amount: "100",
      currency: "CLP",
      amountUf: null,
      ufPolicy: null,
      ufCustomDay: null,
      frequency: "MONTHLY",
      dayOfMonth: 1,
      startDate: new Date("2026-08-01T00:00:00.000Z"),
      endDate: null,
      endAfterOccurrences: null,
    });

    await createRecurrence(
      "t1",
      null,
      {
        amount: 100,
        frequency: "MONTHLY",
        dayOfMonth: 1,
        startDate: "2026-08-01",
        newRow: { section: "OTROS", name: "Misc" },
      },
      null,
    );

    expect(asMock(prisma.financeFlowRow.create)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          mapping: "MANUAL",
          categoryId: null,
        }),
      }),
    );
  });
});
