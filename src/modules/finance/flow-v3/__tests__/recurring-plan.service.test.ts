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
    // createRecurrence estampa nota de regla vía stampCellNotes → upsertCellNote
    financeFlowCellNote: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import { bulkFill } from "../plan.service";
import { listClosedV3Weeks } from "../weekly-close.adapter";
import {
  createRecurrence,
  dedicatedRecurrenceRowName,
  deleteRecurrence,
  expandOccurrenceDates,
  splitStackedRecurrencesOnRow,
  updateRecurrence,
} from "../recurring-plan.service";
import { weekStartYmd } from "../weeks";

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  asMock(listClosedV3Weeks).mockResolvedValue([]);
  asMock(prisma.financeFlowPlanRecurrence.findMany).mockResolvedValue([]);
  asMock(prisma.financeFlowRow.findMany).mockResolvedValue([]);
  asMock(prisma.financeFlowCellNote.deleteMany).mockResolvedValue({ count: 0 });
  asMock(prisma.financeFlowCellNote.upsert).mockResolvedValue({
    body: null,
    updatedBy: null,
  });
});

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
      amount: "1000", currency: "CLP", amountMode: "FIXED", pctSales: null,
      amountUf: null, ufPolicy: null, ufCustomDay: null,
      frequency: "MONTHLY", dayOfMonth: 1,
      startDate: new Date("2020-01-01T00:00:00.000Z"), endDate: null,
      endAfterOccurrences: null,
    });
    asMock(prisma.financeFlowPlanRecurrence.update).mockResolvedValue({
      id: "rec-1", rowId: "row-1", tenantId: "t1",
      amount: "2000", currency: "CLP", amountMode: "FIXED", pctSales: null,
      amountUf: null, ufPolicy: null, ufCustomDay: null,
      frequency: "MONTHLY", dayOfMonth: 1,
      startDate: new Date("2020-01-01T00:00:00.000Z"), endDate: null,
      endAfterOccurrences: null,
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
      amountMode: "FIXED",
      pctSales: null,
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
      amountMode: "FIXED",
      pctSales: null,
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

describe("deleteRecurrence — limpia futuras no selladas", () => {
  it("pone 0 en semanas futuras y salta las cerradas; borra la regla", async () => {
    const currentWeek = weekStartYmd(new Date());
    asMock(prisma.financeFlowPlanRecurrence.findFirst).mockResolvedValue({
      id: "rec-1",
      rowId: "row-1",
      tenantId: "t1",
      amount: "1000",
      currency: "CLP",
      amountMode: "FIXED",
      pctSales: null,
      amountUf: null,
      ufPolicy: null,
      ufCustomDay: null,
      frequency: "MONTHLY",
      dayOfMonth: 1,
      startDate: new Date("2020-01-01T00:00:00.000Z"),
      endDate: null,
      endAfterOccurrences: null,
    });
    asMock(prisma.financeFlowPlanRecurrence.delete).mockResolvedValue({});
    // Primera semana futura = sellada → no debe ir a bulkFill.
    asMock(listClosedV3Weeks).mockImplementation(async (_t: string, weeks: string[]) => {
      const sealed = weeks.filter((w) => w === currentWeek);
      return sealed;
    });

    await deleteRecurrence("t1", "rec-1", false, "u");

    expect(asMock(prisma.financeFlowPlanRecurrence.delete)).toHaveBeenCalledWith({
      where: { id: "rec-1" },
    });
    const calls = asMock(bulkFill).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call[0]).toBe("t1");
      expect(call[1]).toBe("row-1");
      expect(call[3]).toBe(0);
      const weeks = call[2] as string[];
      for (const w of weeks) {
        expect(w >= currentWeek).toBe(true);
        expect(w).not.toBe(currentWeek); // sellada
      }
    }
  });

  it("keepCells=true no toca celdas; solo borra la regla", async () => {
    asMock(prisma.financeFlowPlanRecurrence.findFirst).mockResolvedValue({
      id: "rec-2",
      rowId: "row-1",
      tenantId: "t1",
      amount: "1000",
      currency: "CLP",
      amountMode: "FIXED",
      pctSales: null,
      amountUf: null,
      ufPolicy: null,
      ufCustomDay: null,
      frequency: "MONTHLY",
      dayOfMonth: 1,
      startDate: new Date("2020-01-01T00:00:00.000Z"),
      endDate: null,
      endAfterOccurrences: null,
    });
    asMock(prisma.financeFlowPlanRecurrence.delete).mockResolvedValue({});

    await deleteRecurrence("t1", "rec-2", true, "u");

    expect(asMock(bulkFill)).not.toHaveBeenCalled();
    expect(asMock(prisma.financeFlowPlanRecurrence.delete)).toHaveBeenCalledWith({
      where: { id: "rec-2" },
    });
  });
});

describe("createRecurrence — PCT_SALES", () => {
  it("no materializa celdas y reemplaza regla % previa de la fila", async () => {
    asMock(prisma.financeFlowRow.findFirst).mockResolvedValue({
      section: "GAV", archivedAt: null,
    });
    asMock(prisma.financeFlowPlanRecurrence.deleteMany).mockResolvedValue({ count: 1 });
    asMock(prisma.financeFlowPlanRecurrence.create).mockResolvedValue({
      id: "rec-pct",
      tenantId: "t1",
      rowId: "row-retiro",
      amount: "0",
      currency: "CLP",
      amountMode: "PCT_SALES",
      pctSales: "0.1000",
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
      "row-retiro",
      {
        amount: 0,
        frequency: "MONTHLY",
        dayOfMonth: 5,
        startDate: "2026-08-01",
        amountMode: "PCT_SALES",
        pctSales: 10,
      },
      "u1",
    );

    expect(asMock(prisma.financeFlowPlanRecurrence.deleteMany)).toHaveBeenCalledWith({
      where: { tenantId: "t1", rowId: "row-retiro", amountMode: "PCT_SALES" },
    });
    expect(asMock(prisma.financeFlowPlanRecurrence.create)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amountMode: "PCT_SALES",
          pctSales: 0.1,
          frequency: "MONTHLY",
          dayOfMonth: 5,
        }),
      }),
    );
    expect(result.cells).toEqual([]);
    expect(asMock(bulkFill)).not.toHaveBeenCalled();
  });
});

describe("dedicatedRecurrenceRowName", () => {
  it("usa monto CLP en formato es-CL", () => {
    expect(dedicatedRecurrenceRowName("T.G.R.", {
      amount: 3_557_227,
      currency: "CLP",
      amountMode: "FIXED",
    })).toBe("T.G.R. · $3.557.227");
  });

  it("prioriza la nota si existe", () => {
    expect(dedicatedRecurrenceRowName("T.G.R.", {
      amount: 100,
      note: "PPM 2026",
    })).toBe("T.G.R. · PPM 2026");
  });
});

describe("createRecurrence — una fila por recurrencia FIXED", () => {
  const tgrRow = {
    section: "IMPUESTOS",
    archivedAt: null,
    id: "row-tgr",
    name: "T.G.R.",
    parentId: null,
    canonicalKey: null,
  };

  it("la primera recurrencia queda en la fila destino", async () => {
    asMock(prisma.financeFlowRow.findFirst).mockResolvedValue(tgrRow);
    asMock(prisma.financeFlowPlanRecurrence.create).mockResolvedValue({
      id: "rec-1",
      tenantId: "t1",
      rowId: "row-tgr",
      amount: "6579338",
      currency: "CLP",
      amountMode: "FIXED",
      pctSales: null,
      amountUf: null,
      ufPolicy: null,
      ufCustomDay: null,
      frequency: "MONTHLY",
      dayOfMonth: 25,
      startDate: new Date("2026-08-06T00:00:00.000Z"),
      endDate: new Date("2027-06-30T00:00:00.000Z"),
      endAfterOccurrences: null,
      note: null,
    });

    await createRecurrence(
      "t1",
      "row-tgr",
      {
        amount: 6_579_338,
        frequency: "MONTHLY",
        dayOfMonth: 25,
        startDate: "2026-08-06",
        endDate: "2027-06-30",
        currency: "CLP",
      },
      "u1",
    );

    expect(asMock(prisma.financeFlowRow.create)).not.toHaveBeenCalled();
    expect(asMock(prisma.financeFlowPlanRecurrence.create)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ rowId: "row-tgr", amount: 6_579_338 }),
      }),
    );
    expect(asMock(bulkFill).mock.calls[0][1]).toBe("row-tgr");
  });

  it("la segunda recurrencia mueve la primera a subfila y no pisa celdas", async () => {
    const recOld = {
      id: "rec-old",
      tenantId: "t1",
      rowId: "row-tgr",
      amount: "6579338",
      currency: "CLP" as const,
      amountMode: "FIXED" as const,
      pctSales: null,
      amountUf: null,
      ufPolicy: null,
      ufCustomDay: null,
      frequency: "MONTHLY" as const,
      dayOfMonth: 25,
      startDate: new Date("2026-08-06T00:00:00.000Z"),
      endDate: new Date("2027-06-30T00:00:00.000Z"),
      endAfterOccurrences: null,
      note: null,
      createdAt: new Date("2026-08-01T00:00:00.000Z"),
    };
    asMock(prisma.financeFlowPlanRecurrence.findMany).mockResolvedValue([recOld]);
    asMock(prisma.financeFlowRow.findFirst).mockResolvedValue(tgrRow);
    asMock(prisma.financeFlowRow.create)
      .mockResolvedValueOnce({ id: "row-first" })
      .mockResolvedValueOnce({ id: "row-child" });
    asMock(prisma.financeFlowPlanRecurrence.update).mockResolvedValue({
      ...recOld,
      rowId: "row-first",
    });
    asMock(prisma.financeFlowPlanRecurrence.create).mockResolvedValue({
      id: "rec-2",
      tenantId: "t1",
      rowId: "row-child",
      amount: "3557227",
      currency: "CLP",
      amountMode: "FIXED",
      pctSales: null,
      amountUf: null,
      ufPolicy: null,
      ufCustomDay: null,
      frequency: "MONTHLY",
      dayOfMonth: 25,
      startDate: new Date("2026-09-25T00:00:00.000Z"),
      endDate: null,
      endAfterOccurrences: 17,
      note: null,
    });

    const result = await createRecurrence(
      "t1",
      "row-tgr",
      {
        amount: 3_557_227,
        frequency: "MONTHLY",
        dayOfMonth: 25,
        startDate: "2026-09-25",
        endAfterOccurrences: 17,
        currency: "CLP",
      },
      "u1",
    );

    expect(asMock(prisma.financeFlowPlanRecurrence.update)).toHaveBeenCalledWith({
      where: { id: "rec-old" },
      data: { rowId: "row-first" },
    });
    expect(asMock(prisma.financeFlowRow.create)).toHaveBeenCalledTimes(2);
    expect(asMock(prisma.financeFlowRow.create).mock.calls[0][0].data).toEqual(
      expect.objectContaining({
        parentId: "row-tgr",
        name: "T.G.R. · $6.579.338",
      }),
    );
    expect(asMock(prisma.financeFlowRow.create).mock.calls[1][0].data).toEqual(
      expect.objectContaining({
        parentId: "row-tgr",
        name: "T.G.R. · $3.557.227",
      }),
    );
    expect(result.rule.rowId).toBe("row-child");
    const filledRows = asMock(bulkFill).mock.calls.map((c) => c[1]);
    expect(filledRows).toContain("row-first");
    expect(filledRows).toContain("row-child");
    const nonzeroByRow = new Map<string, number>();
    for (const call of asMock(bulkFill).mock.calls) {
      const row = call[1] as string;
      const amount = call[3] as number;
      if (amount !== 0) nonzeroByRow.set(row, amount);
    }
    expect(nonzeroByRow.get("row-first")).toBe(6_579_338);
    expect(nonzeroByRow.get("row-child")).toBe(3_557_227);
    expect(nonzeroByRow.has("row-tgr")).toBe(false);
  });

  it("si T.G.R. ya es cabecera con subfilas, la siguiente recurrencia también va a subfila", async () => {
    asMock(prisma.financeFlowPlanRecurrence.findMany).mockResolvedValue([]);
    asMock(prisma.financeFlowRow.findFirst).mockResolvedValue(tgrRow);
    asMock(prisma.financeFlowRow.findMany)
      .mockResolvedValueOnce([{ id: "row-first" }])
      .mockResolvedValueOnce([]);
    asMock(prisma.financeFlowRow.create).mockResolvedValue({ id: "row-third" });
    asMock(prisma.financeFlowPlanRecurrence.create).mockResolvedValue({
      id: "rec-3",
      tenantId: "t1",
      rowId: "row-third",
      amount: "1000000",
      currency: "CLP",
      amountMode: "FIXED",
      pctSales: null,
      amountUf: null,
      ufPolicy: null,
      ufCustomDay: null,
      frequency: "MONTHLY",
      dayOfMonth: 10,
      startDate: new Date("2026-10-10T00:00:00.000Z"),
      endDate: null,
      endAfterOccurrences: null,
      note: null,
    });

    const result = await createRecurrence(
      "t1",
      "row-tgr",
      {
        amount: 1_000_000,
        frequency: "MONTHLY",
        dayOfMonth: 10,
        startDate: "2026-10-10",
        currency: "CLP",
      },
      "u1",
    );

    expect(asMock(prisma.financeFlowRow.create)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          parentId: "row-tgr",
          name: "T.G.R. · $1.000.000",
        }),
      }),
    );
    expect(result.rule.rowId).toBe("row-third");
    expect(asMock(bulkFill).mock.calls.some((c) => c[1] === "row-third" && c[3] === 1_000_000)).toBe(true);
  });
});

describe("splitStackedRecurrencesOnRow", () => {
  it("mueve todas las reglas a subfilas y deja el padre en 0", async () => {
    const kept = {
      id: "rec-kept",
      tenantId: "t1",
      rowId: "row-tgr",
      amount: "6579338",
      currency: "CLP" as const,
      amountMode: "FIXED" as const,
      pctSales: null,
      amountUf: null,
      ufPolicy: null,
      ufCustomDay: null,
      frequency: "MONTHLY" as const,
      dayOfMonth: 25,
      startDate: new Date("2026-08-06T00:00:00.000Z"),
      endDate: new Date("2027-06-30T00:00:00.000Z"),
      endAfterOccurrences: null,
      note: null,
      createdAt: new Date("2026-08-01T00:00:00.000Z"),
    };
    const extra = {
      ...kept,
      id: "rec-extra",
      amount: "3557227",
      startDate: new Date("2026-09-25T00:00:00.000Z"),
      endDate: null,
      endAfterOccurrences: 17,
      createdAt: new Date("2026-09-01T00:00:00.000Z"),
    };
    asMock(prisma.financeFlowPlanRecurrence.findMany).mockResolvedValue([kept, extra]);
    asMock(prisma.financeFlowRow.findFirst).mockResolvedValue({
      id: "row-tgr",
      name: "T.G.R.",
      section: "IMPUESTOS",
      parentId: null,
      canonicalKey: null,
    });
    asMock(prisma.financeFlowRow.create)
      .mockResolvedValueOnce({ id: "row-kept" })
      .mockResolvedValueOnce({ id: "row-extra" });
    asMock(prisma.financeFlowPlanRecurrence.update)
      .mockResolvedValueOnce({ ...kept, rowId: "row-kept" })
      .mockResolvedValueOnce({ ...extra, rowId: "row-extra" });

    const remaining = await splitStackedRecurrencesOnRow("t1", "row-tgr", "u1");
    expect(remaining).toBe(0);
    expect(asMock(prisma.financeFlowPlanRecurrence.update)).toHaveBeenCalledTimes(2);
    expect(asMock(prisma.financeFlowPlanRecurrence.update)).toHaveBeenCalledWith({
      where: { id: "rec-kept" },
      data: { rowId: "row-kept" },
    });
    expect(asMock(prisma.financeFlowPlanRecurrence.update)).toHaveBeenCalledWith({
      where: { id: "rec-extra" },
      data: { rowId: "row-extra" },
    });
    const nonzero = asMock(bulkFill).mock.calls
      .filter((c) => c[3] !== 0)
      .map((c) => [c[1], c[3]]);
    expect(nonzero).toEqual(expect.arrayContaining([
      ["row-kept", 6_579_338],
      ["row-extra", 3_557_227],
    ]));
    expect(nonzero.every(([, amt]) => amt === 6_579_338 || amt === 3_557_227)).toBe(true);
    expect(nonzero.some(([row]) => row === "row-tgr")).toBe(false);
    const zeroCall = asMock(bulkFill).mock.calls.find((c) => c[1] === "row-tgr" && c[3] === 0);
    expect(zeroCall).toBeTruthy();
  });
});
