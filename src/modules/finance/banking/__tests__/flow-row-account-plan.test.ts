import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    financeFlowRowAccount: { findFirst: vi.fn() },
    financeCashflowCategory: { findFirst: vi.fn() },
    financeFlowRow: { findFirst: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { resolveAccountPlanIdForFlowRow } from "../flow-row-account-plan.service";

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;
const TENANT = "t1";

beforeEach(() => {
  vi.clearAllMocks();
  asMock(prisma.financeFlowRowAccount.findFirst).mockResolvedValue(null);
  asMock(prisma.financeCashflowCategory.findFirst).mockResolvedValue(null);
  asMock(prisma.financeFlowRow.findFirst).mockResolvedValue(null);
});

describe("resolveAccountPlanIdForFlowRow", () => {
  it("usa la cuenta primaria del renglón", async () => {
    asMock(prisma.financeFlowRowAccount.findFirst).mockResolvedValueOnce({
      accountPlanId: "ap-own",
    });
    const out = await resolveAccountPlanIdForFlowRow(TENANT, {
      id: "row-1",
      categoryId: null,
    });
    expect(out).toBe("ap-own");
    expect(prisma.financeFlowRow.findFirst).not.toHaveBeenCalled();
  });

  it("subfila sin cuentas hereda la cuenta del padre", async () => {
    asMock(prisma.financeFlowRowAccount.findFirst)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ accountPlanId: "ap-parent" });
    asMock(prisma.financeFlowRow.findFirst).mockResolvedValue({
      id: "parent-1",
      categoryId: null,
    });

    const out = await resolveAccountPlanIdForFlowRow(TENANT, {
      id: "child-1",
      categoryId: null,
      parentId: "parent-1",
    });

    expect(out).toBe("ap-parent");
    expect(prisma.financeFlowRow.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: "parent-1" }) }),
    );
  });

  it("sin cuentas propias ni padre → null", async () => {
    const out = await resolveAccountPlanIdForFlowRow(TENANT, {
      id: "row-1",
      categoryId: null,
    });
    expect(out).toBeNull();
  });
});
