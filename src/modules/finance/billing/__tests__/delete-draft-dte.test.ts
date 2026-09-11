import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("server-only", () => ({}));

const { findDraft, getTx, resetTx } = vi.hoisted(() => {
  function createTx() {
    return {
      financeFactoringOperation: {
        count: vi.fn().mockResolvedValue(0),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      financePaymentAllocation: {
        findMany: vi.fn().mockResolvedValue([]),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        count: vi.fn().mockResolvedValue(0),
      },
      financePaymentRecord: {
        findMany: vi.fn().mockResolvedValue([]),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      financeReconciliationMatch: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      financeBankTransactionLink: {
        findMany: vi.fn().mockResolvedValue([]),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        count: vi.fn().mockResolvedValue(0),
      },
      financeBankTransaction: { update: vi.fn().mockResolvedValue({}) },
      financeCashflowOccurrence: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      financeDteRecurringRun: {
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      financeDte: { delete: vi.fn().mockResolvedValue({}) },
    };
  }
  let tx = createTx();
  return {
    findDraft: vi.fn(),
    getTx: () => tx,
    resetTx: () => {
      tx = createTx();
      return tx;
    },
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    financeDte: {
      findFirst: (...a: unknown[]) => findDraft(...a),
    },
    $transaction: (cb: (client: ReturnType<typeof getTx>) => unknown) => cb(getTx()),
  },
}));

vi.mock("../dte-issuer.service", () => ({
  issueDte: vi.fn(),
}));

vi.mock("@/modules/finance/cashflow/draft-occurrence-matcher.service", () => ({
  matchDraftToOccurrence: vi.fn(),
  rebindDraftOccurrencesToIssued: vi.fn(),
}));

import { deleteDraftDte } from "../dte-draft.service";

describe("deleteDraftDte — allocations de pago no bloquean el borrado", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetTx();
    findDraft.mockResolvedValue({ id: "draft-1" });
  });

  it("rechaza si el borrador no existe o ya se emitió", async () => {
    findDraft.mockResolvedValue(null);
    await expect(deleteDraftDte("tenant-1", "draft-1")).rejects.toThrow(
      "Borrador no encontrado o ya emitido",
    );
    expect(getTx().financeDte.delete).not.toHaveBeenCalled();
  });

  it("borra el draft cuando no hay allocations ni factoring", async () => {
    await deleteDraftDte("tenant-1", "draft-1");

    expect(getTx().financePaymentAllocation.deleteMany).not.toHaveBeenCalled();
    expect(getTx().financeDte.delete).toHaveBeenCalledWith({ where: { id: "draft-1" } });
  });

  it("anota la eliminación en los runs de programación", async () => {
    getTx().financeDteRecurringRun.findMany.mockResolvedValue([{ id: "run-1" }]);

    await deleteDraftDte("tenant-1", "draft-1");

    expect(getTx().financeDteRecurringRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["run-1"] } },
      }),
    );
  });

  it("desvincula allocations y borra el PaymentRecord huérfano", async () => {
    const tx = getTx();
    tx.financePaymentAllocation.findMany.mockResolvedValue([
      { id: "alloc-1", paymentId: "pay-1" },
    ]);
    tx.financePaymentAllocation.count.mockResolvedValue(0);
    tx.financePaymentRecord.findMany.mockResolvedValue([
      { bankTransactionId: "btx-1" },
    ]);

    await deleteDraftDte("tenant-1", "draft-1");

    expect(tx.financePaymentAllocation.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["alloc-1"] } },
    });
    expect(tx.financeReconciliationMatch.updateMany).toHaveBeenCalledWith({
      where: { paymentRecordId: { in: ["pay-1"] } },
      data: { paymentRecordId: null },
    });
    expect(tx.financePaymentRecord.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["pay-1"] } },
    });
    expect(tx.financeDte.delete).toHaveBeenCalledWith({ where: { id: "draft-1" } });
  });

  it("no borra un PaymentRecord que sigue asignado a otro DTE", async () => {
    const tx = getTx();
    tx.financePaymentAllocation.findMany.mockResolvedValue([
      { id: "alloc-1", paymentId: "pay-shared" },
    ]);
    tx.financePaymentAllocation.count.mockResolvedValue(1);

    await deleteDraftDte("tenant-1", "draft-1");

    expect(tx.financePaymentAllocation.deleteMany).toHaveBeenCalled();
    expect(tx.financePaymentRecord.deleteMany).not.toHaveBeenCalled();
    expect(tx.financeDte.delete).toHaveBeenCalled();
  });

  it("deja UNMATCHED el movimiento bancario si ya no tiene links", async () => {
    const tx = getTx();
    tx.financeBankTransactionLink.findMany.mockResolvedValue([
      { bankTransactionId: "btx-1" },
    ]);
    tx.financeBankTransactionLink.count.mockResolvedValue(0);

    await deleteDraftDte("tenant-1", "draft-1");

    expect(tx.financeBankTransactionLink.deleteMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-1", targetType: "DTE_ISSUED", targetId: "draft-1" },
    });
    expect(tx.financeBankTransaction.update).toHaveBeenCalledWith({
      where: { id: "btx-1" },
      data: { reconciliationStatus: "UNMATCHED" },
    });
    expect(tx.financeCashflowOccurrence.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: "tenant-1", bankTransactionId: "btx-1" },
      }),
    );
  });

  it("rechaza con mensaje claro si hay operación de factoring", async () => {
    getTx().financeFactoringOperation.count.mockResolvedValue(1);

    await expect(deleteDraftDte("tenant-1", "draft-1")).rejects.toThrow(
      "operación de factoring",
    );
    expect(getTx().financeDte.delete).not.toHaveBeenCalled();
  });

  it("traduce P2003 residual a un error entendible", async () => {
    getTx().financeDte.delete.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("fk", {
        code: "P2003",
        clientVersion: "6.0.0",
      }),
    );

    await expect(deleteDraftDte("tenant-1", "draft-1")).rejects.toThrow(
      "tiene pagos u otros documentos asociados",
    );
  });
});
