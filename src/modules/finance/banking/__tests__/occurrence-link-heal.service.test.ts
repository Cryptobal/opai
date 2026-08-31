import { describe, it, expect, vi, beforeEach } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";

const prismaMock = vi.hoisted(() => ({
  financeBankTransactionLink: { count: vi.fn(), create: vi.fn() },
  financeCashflowOccurrence: { findFirst: vi.fn() },
  financeBankTransaction: { findFirst: vi.fn() },
  financeFlowRow: { findMany: vi.fn() },
  financeFlowRowAccount: { findFirst: vi.fn() },
  financeCashflowCategory: { findFirst: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import {
  createExpenseIncomeLinkForCategory,
  healBankTxLinkFromCashflowOccurrence,
} from "../occurrence-link-heal.service";

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.financeBankTransactionLink.count.mockResolvedValue(0);
  prismaMock.financeFlowRowAccount.findFirst.mockResolvedValue({
    accountPlanId: "plan-retiro",
  });
  prismaMock.financeCashflowCategory.findFirst.mockResolvedValue(null);
});

describe("healBankTxLinkFromCashflowOccurrence", () => {
  it("no-op si ya hay links", async () => {
    prismaMock.financeBankTransactionLink.count.mockResolvedValue(1);
    const r = await healBankTxLinkFromCashflowOccurrence("t1", "tx-1", null);
    expect(r).toEqual({ created: false, reason: "already_has_links" });
    expect(prismaMock.financeBankTransactionLink.create).not.toHaveBeenCalled();
  });

  it("crea EXPENSE + flowRowId Retiro socios desde occurrence", async () => {
    prismaMock.financeCashflowOccurrence.findFirst.mockResolvedValue({
      amountClp: new Decimal(5_000_000),
      item: { name: "Retiro socios 2026-08", kind: "EXPENSE", categoryId: "cat-retiro" },
    });
    prismaMock.financeBankTransaction.findFirst.mockResolvedValue({
      amount: new Decimal(-5_000_000),
    });
    prismaMock.financeFlowRow.findMany.mockResolvedValue([
      { id: "row-retiro", name: "Retiro socios", categoryId: "cat-retiro" },
    ]);

    const r = await healBankTxLinkFromCashflowOccurrence("t1", "tx-5m", "user-1");
    expect(r).toEqual({ created: true, flowRowId: "row-retiro" });
    expect(prismaMock.financeBankTransactionLink.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: "t1",
        bankTransactionId: "tx-5m",
        targetType: "EXPENSE",
        accountPlanId: "plan-retiro",
        flowRowId: "row-retiro",
        matchSource: "MANUAL",
      }),
    });
  });
});

describe("createExpenseIncomeLinkForCategory", () => {
  it("matchea por nombre si no hay categoryId", async () => {
    prismaMock.financeFlowRow.findMany.mockResolvedValue([
      { id: "row-retiro", name: "Retiro socios", categoryId: null },
    ]);
    const r = await createExpenseIncomeLinkForCategory({
      tenantId: "t1",
      bankTxId: "tx-1",
      userId: null,
      amountAbs: 5_000_000,
      isIncome: false,
      categoryId: null,
      itemName: "Retiro socios 2026-08",
    });
    expect(r).toEqual({ flowRowId: "row-retiro" });
  });
});
