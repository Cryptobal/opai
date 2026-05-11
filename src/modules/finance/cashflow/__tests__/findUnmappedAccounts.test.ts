import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    financeCashflowCategoryAccount: { findMany: vi.fn() },
    financeAccountPlan: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { findUnmappedAccounts } from "../categoryAccount.service";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("findUnmappedAccounts", () => {
  it("devuelve solo cuentas sin mapping", async () => {
    (prisma.financeCashflowCategoryAccount.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { accountPlanId: "acc-1" },
    ]);
    (prisma.financeAccountPlan.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "acc-2", code: "5.1.02.005", name: "Servicios profesionales TI" },
    ]);
    const result = await findUnmappedAccounts("tenant-1", ["acc-1", "acc-2"]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("acc-2");
  });

  it("array vacío si no hay accountPlanIds", async () => {
    const result = await findUnmappedAccounts("tenant-1", []);
    expect(result).toEqual([]);
  });

  it("array vacío si todas están mapeadas", async () => {
    (prisma.financeCashflowCategoryAccount.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { accountPlanId: "acc-1" },
      { accountPlanId: "acc-2" },
    ]);
    const result = await findUnmappedAccounts("tenant-1", ["acc-1", "acc-2"]);
    expect(result).toEqual([]);
  });
});
