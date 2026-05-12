import { describe, it, expect, vi, beforeEach } from "vitest";

const txMockFns = {
  financeCashflowItem: { create: vi.fn() },
  financeCashflowOccurrence: { create: vi.fn() },
  financeBankTransaction: { update: vi.fn() },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    financeCashflowCategory: { findFirst: vi.fn() },
    financeBankTransaction: { findFirst: vi.fn() },
    financeCashflowOccurrence: { findFirst: vi.fn() },
    $transaction: vi.fn(async (cb: (tx: typeof txMockFns) => unknown) => cb(txMockFns)),
  },
}));

import { prisma } from "@/lib/prisma";
import { createAjusteConciliacion } from "../ajuste.service";

const findCategory = prisma.financeCashflowCategory.findFirst as unknown as ReturnType<typeof vi.fn>;
const findBankTx = prisma.financeBankTransaction.findFirst as unknown as ReturnType<typeof vi.fn>;
const findOccurrenceBankTx = prisma.financeCashflowOccurrence.findFirst as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  findCategory.mockReset();
  findBankTx.mockReset();
  findOccurrenceBankTx.mockReset();
  txMockFns.financeCashflowItem.create.mockReset();
  txMockFns.financeCashflowOccurrence.create.mockReset();
  txMockFns.financeBankTransaction.update.mockReset();
});

describe("createAjusteConciliacion", () => {
  it("rechaza monto 0", async () => {
    await expect(
      createAjusteConciliacion("t1", "u1", {
        amountClp: 0,
        effectiveDate: new Date("2026-05-12"),
        notes: "Esto debería fallar",
      }),
    ).rejects.toThrow(/no puede ser 0/);
  });

  it("rechaza notas vacías", async () => {
    await expect(
      createAjusteConciliacion("t1", "u1", {
        amountClp: 50_000,
        effectiveDate: new Date("2026-05-12"),
        notes: "x",
      }),
    ).rejects.toThrow(/obligatorias/);
  });

  it("rechaza si la categoría sistema no existe", async () => {
    findCategory.mockResolvedValueOnce(null);
    await expect(
      createAjusteConciliacion("t1", "u1", {
        amountClp: 100_000,
        effectiveDate: new Date("2026-05-12"),
        notes: "ajuste de cuadratura",
      }),
    ).rejects.toThrow(/no encontrada/);
  });

  it("monto positivo → INCOME + ING_AJUSTE_CONCILIACION", async () => {
    findCategory.mockResolvedValueOnce({ id: "cat-1" });
    txMockFns.financeCashflowItem.create.mockResolvedValueOnce({ id: "item-1" });
    txMockFns.financeCashflowOccurrence.create.mockResolvedValueOnce({ id: "occ-1" });

    const result = await createAjusteConciliacion("t1", "u1", {
      amountClp: 100_000,
      effectiveDate: new Date("2026-05-12"),
      notes: "cierre de drift positivo",
    });

    expect(result.categoryCode).toBe("ING_AJUSTE_CONCILIACION");
    expect(findCategory).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ code: "ING_AJUSTE_CONCILIACION" }),
      }),
    );
    expect(txMockFns.financeCashflowItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ kind: "INCOME", source: "AJUSTE" }),
      }),
    );
  });

  it("monto negativo → EXPENSE + EGR_AJUSTE_CONCILIACION", async () => {
    findCategory.mockResolvedValueOnce({ id: "cat-2" });
    txMockFns.financeCashflowItem.create.mockResolvedValueOnce({ id: "item-2" });
    txMockFns.financeCashflowOccurrence.create.mockResolvedValueOnce({ id: "occ-2" });

    const result = await createAjusteConciliacion("t1", "u1", {
      amountClp: -50_000,
      effectiveDate: new Date("2026-05-12"),
      notes: "cierre de drift negativo",
    });

    expect(result.categoryCode).toBe("EGR_AJUSTE_CONCILIACION");
    expect(findCategory).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ code: "EGR_AJUSTE_CONCILIACION" }),
      }),
    );
    expect(txMockFns.financeCashflowItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ kind: "EXPENSE", source: "AJUSTE" }),
      }),
    );
  });

  it("rechaza si bank tx ya está vinculada a otra occurrence", async () => {
    findCategory.mockResolvedValueOnce({ id: "cat-1" });
    findBankTx.mockResolvedValueOnce({ id: "btx-1" });
    findOccurrenceBankTx.mockResolvedValueOnce({ id: "occ-99" });

    await expect(
      createAjusteConciliacion("t1", "u1", {
        amountClp: 100_000,
        effectiveDate: new Date("2026-05-12"),
        notes: "intento con tx ya usada",
        bankTransactionId: "btx-1",
      }),
    ).rejects.toThrow(/ya está vinculado/);
  });

  it("vincula la occurrence a la bank tx cuando se entrega", async () => {
    findCategory.mockResolvedValueOnce({ id: "cat-1" });
    findBankTx.mockResolvedValueOnce({ id: "btx-1" });
    findOccurrenceBankTx.mockResolvedValueOnce(null);
    txMockFns.financeCashflowItem.create.mockResolvedValueOnce({ id: "item-1" });
    txMockFns.financeCashflowOccurrence.create.mockResolvedValueOnce({ id: "occ-1" });

    await createAjusteConciliacion("t1", "u1", {
      amountClp: 100_000,
      effectiveDate: new Date("2026-05-12"),
      notes: "ajuste con bank tx",
      bankTransactionId: "btx-1",
    });

    expect(txMockFns.financeCashflowOccurrence.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ bankTransactionId: "btx-1" }),
      }),
    );
    expect(txMockFns.financeBankTransaction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "btx-1" },
        data: { reconciliationStatus: "MATCHED" },
      }),
    );
  });
});
