import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("../plan.service", () => ({ bulkFill: vi.fn(async () => []) }));
vi.mock("../weekly-close.adapter", () => ({ listClosedV3Weeks: vi.fn(async () => []) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    financeFlowPlanRecurrence: { findFirst: vi.fn(), update: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { bulkFill } from "../plan.service";
import { expandOccurrenceDates, updateRecurrence } from "../recurring-plan.service";
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
});

describe("updateRecurrence — no reescribe el pasado", () => {
  it("solo materializa (bulkFill) semanas ≥ la semana actual", async () => {
    asMock(prisma.financeFlowPlanRecurrence.findFirst).mockResolvedValue({
      id: "rec-1", rowId: "row-1", tenantId: "t1",
      amount: "1000", frequency: "MONTHLY", dayOfMonth: 1,
      startDate: new Date("2020-01-01T00:00:00.000Z"), endDate: null,
    });
    asMock(prisma.financeFlowPlanRecurrence.update).mockResolvedValue({
      id: "rec-1", rowId: "row-1", tenantId: "t1",
      amount: "2000", frequency: "MONTHLY", dayOfMonth: 1,
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
