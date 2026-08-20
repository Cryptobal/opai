import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/uf", () => ({
  getUfValueForDate: vi.fn(async () => 39_000),
}));
vi.mock("../recurring-plan.service", () => ({
  expandOccurrenceDates: () => [],
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    financeFlowPlanRecurrence: { findMany: vi.fn() },
    financeCashflowConfig: { findUnique: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { evaluateFlowRowUfAmountNear } from "../uf-amount-near.service";

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("evaluateFlowRowUfAmountNear", () => {
  it("null si la fila no tiene recurrencia UF", async () => {
    asMock(prisma.financeFlowPlanRecurrence.findMany).mockResolvedValue([]);
    const near = await evaluateFlowRowUfAmountNear({
      tenantId: "t1",
      flowRowId: "r1",
      bankAmountClp: 900_000,
    });
    expect(near).toBeNull();
  });

  it("true si el cargo está cerca del UF×valor", async () => {
    asMock(prisma.financeFlowPlanRecurrence.findMany).mockResolvedValue([
      { amountUf: 24.5 },
    ]);
    asMock(prisma.financeCashflowConfig.findUnique).mockResolvedValue({
      matchAmountToleranceClp: 5000,
    });
    const expected = Math.round(24.5 * 39_000);
    const near = await evaluateFlowRowUfAmountNear({
      tenantId: "t1",
      flowRowId: "r1",
      bankAmountClp: expected + 8_000,
    });
    expect(near).toBe(true);
  });

  it("false si el cargo está lejos", async () => {
    asMock(prisma.financeFlowPlanRecurrence.findMany).mockResolvedValue([
      { amountUf: 24.5 },
    ]);
    asMock(prisma.financeCashflowConfig.findUnique).mockResolvedValue({
      matchAmountToleranceClp: 5000,
    });
    const near = await evaluateFlowRowUfAmountNear({
      tenantId: "t1",
      flowRowId: "r1",
      bankAmountClp: 2_000_000,
    });
    expect(near).toBe(false);
  });
});
