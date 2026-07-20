import { describe, expect, it, vi, beforeEach } from "vitest";
import { normalizeWeekdays, onlyRealWeekdays } from "@/lib/cpq/weekdays";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    cpqQuote: { findFirst: vi.fn() },
    cpqPosition: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    $transaction: vi.fn((ops: unknown) => Promise.all(ops as Promise<unknown>[])),
  },
}));

vi.mock("@/lib/crm-history", () => ({
  createCrmHistoryLog: vi.fn(),
}));

vi.mock("@/modules/payroll/engine/compute-employer-cost", () => ({
  computeEmployerCost: vi.fn(() => ({
    employerCost: 0,
    employeeCost: 0,
    breakdown: {},
  })),
}));

vi.mock("@/lib/cpq/cpq-employer-cost-input", () => ({
  buildCpqStyleEmployerCostInput: vi.fn(() => ({})),
}));

vi.mock("@/modules/cpq/costing/compute-quote-costs", () => ({
  refreshQuoteTotals: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { patchQuotePosition } from "../quote-position-write.service";

describe("patchQuotePosition weekdays Fer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.cpqQuote.findFirst).mockResolvedValue({
      id: "q1",
      tenantId: "t1",
    } as never);
    vi.mocked(prisma.cpqPosition.findFirst).mockResolvedValue({
      id: "p1",
      quoteId: "q1",
      baseSalary: 500000,
      afpName: "habitat",
      healthSystem: "fonasa",
      healthPlanPct: 0.07,
      cargoId: "c1",
      rolId: "r1",
      weekdays: ["Lun"],
    } as never);
  });

  it("rechaza weekdays solo con Fer (WEEKDAYS_INVALID)", async () => {
    // Guardia de precondición: Fer sola no deja días reales
    expect(onlyRealWeekdays(normalizeWeekdays(["Fer"]))).toHaveLength(0);

    await expect(
      patchQuotePosition({
        quoteId: "q1",
        positionId: "p1",
        tenantId: "t1",
        userId: "u1",
        body: { weekdays: ["Fer"] },
      }),
    ).rejects.toThrow("WEEKDAYS_INVALID");
  });
});
