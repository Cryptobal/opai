/**
 * Tests de unreconcileIssuedDte — desconciliar DTE emitido desde facturación.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";

vi.mock("@/lib/prisma", () => {
  const $transaction = vi.fn();
  return {
    prisma: {
      $transaction,
      financeDte: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      financeBankTransactionLink: {
        findMany: vi.fn(),
        deleteMany: vi.fn(),
        count: vi.fn(),
      },
      financePaymentAllocation: {
        findMany: vi.fn(),
        deleteMany: vi.fn(),
        count: vi.fn(),
        aggregate: vi.fn(),
      },
      financePaymentRecord: {
        delete: vi.fn(),
      },
      financeBankTransaction: {
        update: vi.fn(),
      },
      financeCashflowOccurrence: {
        updateMany: vi.fn(),
      },
      financeCashflowConfig: {
        findUnique: vi.fn(),
      },
    },
  };
});

vi.mock("../../accounting/journal-entry.service", () => ({
  createManualEntry: vi.fn(),
}));

vi.mock("../write-off.service", () => ({
  evaluateWriteOff: vi.fn(() => ({ shouldApply: false })),
  applyAutoWriteOff: vi.fn(),
  resolveCounterpartyAccountId: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { unreconcileIssuedDte } from "../bank-tx-link.service";

const $tx = prisma.$transaction as unknown as ReturnType<typeof vi.fn>;
const dteId = "dte-1748";
const tenantId = "tenant-gard";
const bankTxId = "bank-tx-1";

function mockTxClient() {
  $tx.mockImplementation(
    async (cb: (tx: typeof prisma) => unknown) => cb(prisma),
  );
}

function dec(n: number) {
  return new Decimal(n);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockTxClient();
  (prisma.financeDte.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
    id: dteId,
  });
  (prisma.financeBankTransactionLink.findMany as ReturnType<typeof vi.fn>)
    .mockResolvedValue([{ bankTransactionId: bankTxId }]);
  (prisma.financePaymentAllocation.findMany as ReturnType<typeof vi.fn>)
    .mockResolvedValue([{ id: "alloc-1", paymentId: "pay-1" }]);
  (prisma.financePaymentAllocation.deleteMany as ReturnType<typeof vi.fn>)
    .mockResolvedValue({ count: 1 });
  (prisma.financePaymentAllocation.count as ReturnType<typeof vi.fn>)
    .mockResolvedValue(0);
  (prisma.financePaymentRecord.delete as ReturnType<typeof vi.fn>).mockResolvedValue(
    {},
  );
  (prisma.financeBankTransactionLink.deleteMany as ReturnType<typeof vi.fn>)
    .mockResolvedValue({ count: 1 });
  (prisma.financeBankTransactionLink.count as ReturnType<typeof vi.fn>)
    .mockImplementation(async (args: { where?: { bankTransactionId?: string } }) => {
      if (args?.where?.bankTransactionId) return 0;
      return 0;
    });
  (prisma.financeDte.update as ReturnType<typeof vi.fn>).mockResolvedValue({});
  (prisma.financeBankTransaction.update as ReturnType<typeof vi.fn>).mockResolvedValue(
    {},
  );
  (prisma.financeCashflowOccurrence.updateMany as ReturnType<typeof vi.fn>)
    .mockResolvedValue({ count: 0 });
});

describe("unreconcileIssuedDte — recompute bank-aligned (default)", () => {
  it("elimina links, limpia reconciledAt y recomputa a UNPAID", async () => {
    (prisma.financeDte.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      totalAmount: dec(1_000_000),
      dueDate: new Date("2099-12-31"),
      paymentStatus: "PAID",
      amountPaid: dec(1_000_000),
      reconciledAt: new Date("2026-06-01"),
    });
    (prisma.financePaymentAllocation.aggregate as ReturnType<typeof vi.fn>)
      .mockResolvedValue({ _sum: { amount: null } });

    const result = await unreconcileIssuedDte(tenantId, dteId);

    expect(result.bankLinksRemoved).toBe(1);
    expect(prisma.financeBankTransactionLink.deleteMany).toHaveBeenCalledWith({
      where: { tenantId, targetType: "DTE_ISSUED", targetId: dteId },
    });
    expect(prisma.financeDte.update).toHaveBeenCalledWith({
      where: { id: dteId },
      data: { reconciledAt: null },
    });
    expect(prisma.financeDte.update).toHaveBeenCalledWith({
      where: { id: dteId },
      data: {
        amountPaid: dec(0),
        amountPending: dec(1_000_000),
        paymentStatus: "UNPAID",
      },
    });
    expect(prisma.financeBankTransaction.update).toHaveBeenCalledWith({
      where: { id: bankTxId },
      data: { reconciliationStatus: "UNMATCHED" },
    });
  });
});

describe("unreconcileIssuedDte — keepPaymentStatus (UI facturación)", () => {
  it("preserva PAID, limpia reconciledAt y links", async () => {
    (prisma.financeDte.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      totalAmount: dec(500_000),
      dueDate: new Date("2099-12-31"),
      paymentStatus: "PAID",
      amountPaid: dec(500_000),
      reconciledAt: new Date("2026-06-01"),
    });

    await unreconcileIssuedDte(tenantId, dteId, { keepPaymentStatus: true });

    expect(prisma.financeDte.update).toHaveBeenCalledWith({
      where: { id: dteId },
      data: { reconciledAt: null },
    });
    expect(prisma.financePaymentAllocation.aggregate).not.toHaveBeenCalled();
    const paymentUpdates = (
      prisma.financeDte.update as ReturnType<typeof vi.fn>
    ).mock.calls.filter(
      (c) => c[0]?.data?.paymentStatus !== undefined,
    );
    expect(paymentUpdates).toHaveLength(0);
  });
});

describe("unreconcileIssuedDte — sin conciliación previa", () => {
  it("retorna ceros idempotentemente", async () => {
    (prisma.financeBankTransactionLink.findMany as ReturnType<typeof vi.fn>)
      .mockResolvedValue([]);
    (prisma.financePaymentAllocation.findMany as ReturnType<typeof vi.fn>)
      .mockResolvedValue([]);
    (prisma.financeBankTransactionLink.deleteMany as ReturnType<typeof vi.fn>)
      .mockResolvedValue({ count: 0 });

    const result = await unreconcileIssuedDte(tenantId, dteId);

    expect(result).toEqual({
      allocationsRemoved: 0,
      paymentsDeleted: 0,
      bankLinksRemoved: 0,
      bankTransactionsReset: 0,
    });
    expect(prisma.financeDte.update).not.toHaveBeenCalled();
  });
});
