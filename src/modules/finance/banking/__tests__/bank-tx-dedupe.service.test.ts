import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    financeBankTransaction: { findMany: vi.fn() },
    financeBankTransactionLink: { deleteMany: vi.fn() },
    financePaymentRecord: { updateMany: vi.fn() },
    financeReconciliationMatch: { deleteMany: vi.fn() },
  },
}));

vi.mock("@/modules/finance/banking/bank-transaction.service", () => ({
  bulkHideTransactions: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { bulkHideTransactions } from "@/modules/finance/banking/bank-transaction.service";
import { hideContentDuplicateBankTransactions } from "../bank-tx-dedupe.service";

const findMany = prisma.financeBankTransaction.findMany as unknown as ReturnType<
  typeof vi.fn
>;
const deleteLinks = prisma.financeBankTransactionLink
  .deleteMany as unknown as ReturnType<typeof vi.fn>;
const unlinkPayments = prisma.financePaymentRecord
  .updateMany as unknown as ReturnType<typeof vi.fn>;
const deleteMatches = prisma.financeReconciliationMatch
  .deleteMany as unknown as ReturnType<typeof vi.fn>;
const bulkHide = bulkHideTransactions as unknown as ReturnType<typeof vi.fn>;

describe("hideContentDuplicateBankTransactions", () => {
  beforeEach(() => {
    findMany.mockReset();
    deleteLinks.mockReset();
    unlinkPayments.mockReset();
    deleteMatches.mockReset();
    bulkHide.mockReset();
  });

  it("no hace nada si no hay copias", async () => {
    findMany.mockResolvedValueOnce([
      {
        id: "1",
        transactionDate: new Date("2026-08-04"),
        amount: 100,
        description: "A",
        reference: null,
        createdAt: new Date(),
        reconciliationStatus: "UNMATCHED",
      },
    ]);

    const r = await hideContentDuplicateBankTransactions({
      tenantId: "t1",
      bankAccountId: "a1",
    });
    expect(r.hidden).toBe(0);
    expect(bulkHide).not.toHaveBeenCalled();
  });

  it("oculta extras, conserva MATCHED y borra sus links", async () => {
    findMany.mockResolvedValueOnce([
      {
        id: "copy-1",
        transactionDate: new Date("2026-08-04T00:00:00.000Z"),
        amount: 7_000_000,
        description: "SCF SERVICIOS F",
        reference: "77460259-3",
        createdAt: new Date("2026-08-04T17:00:00Z"),
        reconciliationStatus: "UNMATCHED",
      },
      {
        id: "keeper",
        transactionDate: new Date("2026-08-04T00:00:00.000Z"),
        amount: 7_000_000,
        description: "SCF SERVICIOS F",
        reference: "77460259-3",
        createdAt: new Date("2026-08-04T18:00:00Z"),
        reconciliationStatus: "MATCHED",
      },
      {
        id: "copy-2",
        transactionDate: new Date("2026-08-04T00:00:00.000Z"),
        amount: 7_000_000,
        description: "SCF SERVICIOS F",
        reference: "77460259-3",
        createdAt: new Date("2026-08-04T19:00:00Z"),
        reconciliationStatus: "MATCHED",
      },
    ]);
    deleteLinks.mockResolvedValueOnce({ count: 2 });
    unlinkPayments.mockResolvedValueOnce({ count: 0 });
    deleteMatches.mockResolvedValueOnce({ count: 0 });
    bulkHide.mockResolvedValueOnce(2);

    const r = await hideContentDuplicateBankTransactions({
      tenantId: "t1",
      bankAccountId: "a1",
      hiddenById: "user-1",
    });

    expect(r.groups).toBe(1);
    expect(r.keeperIds).toEqual(["keeper"]);
    expect(deleteLinks).toHaveBeenCalledWith({
      where: {
        tenantId: "t1",
        bankTransactionId: { in: ["copy-1", "copy-2"] },
      },
    });
    expect(unlinkPayments).toHaveBeenCalled();
    expect(deleteMatches).toHaveBeenCalled();
    expect(bulkHide).toHaveBeenCalledWith(
      "t1",
      ["copy-1", "copy-2"],
      "user-1",
      expect.stringContaining("Duplicado de contenido"),
    );
    expect(r.hidden).toBe(2);
  });
});
