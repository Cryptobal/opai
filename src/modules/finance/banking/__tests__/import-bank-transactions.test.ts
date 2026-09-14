import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    financeBankAccount: { findFirst: vi.fn(), update: vi.fn() },
    financeBankTransaction: {
      findMany: vi.fn(),
      createMany: vi.fn(),
      updateMany: vi.fn(),
      aggregate: vi.fn(),
    },
    financeBankStatementImport: { create: vi.fn() },
    financeBankAccountBalance: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    financeCashflowConfig: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("../auto-match-payment.service", () => ({
  bulkAutoMatchBankTransactions: vi.fn(),
}));
vi.mock("../rut-recognition.service", () => ({
  recognizeRutsForTransactions: vi.fn(async () => new Map()),
}));

import { prisma } from "@/lib/prisma";
import { importBankTransactions, previewBankStatementImport } from "../bank-transaction.service";

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;
const findAccount = asMock(prisma.financeBankAccount.findFirst);
const txFindMany = asMock(prisma.financeBankTransaction.findMany);
const createMany = asMock(prisma.financeBankTransaction.createMany);
const updateMany = asMock(prisma.financeBankTransaction.updateMany);
const importCreate = asMock(prisma.financeBankStatementImport.create);
const findOpening = asMock(prisma.financeBankAccountBalance.findFirst);
const findSnapshots = asMock(prisma.financeBankAccountBalance.findMany);
const createSnapshot = asMock(prisma.financeBankAccountBalance.create);
const aggregate = asMock(prisma.financeBankTransaction.aggregate);
const findConfig = asMock(prisma.financeCashflowConfig.findUnique);

const row = {
  transactionDate: "2026-09-07",
  description: "Transf. Contrato Josue",
  reference: null,
  amount: 303_768,
};

const dbRow = (id: string) => ({
  id,
  transactionDate: new Date("2026-09-07T00:00:00.000Z"),
  amount: 303_768,
  description: "Transf. Contrato Josue",
  reference: null,
  balance: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  findAccount.mockResolvedValue({ id: "a1", currentBalance: 0 });
  asMock(prisma.financeBankAccount.update).mockResolvedValue({});
  importCreate.mockResolvedValue({ id: "imp-1" });
  updateMany.mockResolvedValue({ count: 0 });
  findSnapshots.mockResolvedValue([]);
  findConfig.mockResolvedValue({ bankBalanceDiscrepancyThresholdClp: 100_000 });
  findOpening.mockResolvedValue({
    id: "o",
    asOfDate: new Date("2026-08-31T00:00:00.000Z"),
    balance: 1_000_000,
    note: null,
    createdAt: new Date(),
  });
  aggregate.mockResolvedValue({ _sum: { amount: 0 }, _count: { _all: 0 } });
  createSnapshot.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
    id: "snap",
    ...args.data,
    createdAt: new Date(),
  }));
});

describe("importBankTransactions — cartola con filas repetidas", () => {
  it("dos transferencias idénticas en el archivo se insertan ambas con ids distintos", async () => {
    txFindMany.mockResolvedValueOnce([]); // sin filas previas
    createMany.mockResolvedValueOnce({ count: 2 });

    const r = await importBankTransactions("t1", "a1", [row, { ...row }], null, undefined, {
      fileName: "cartola.xlsx",
      fileSize: 10,
      bankFormat: "SANTANDER",
    });

    expect(r.importedCount).toBe(2);
    expect(r.duplicateCount).toBe(0);
    const data = createMany.mock.calls[0][0].data as Array<{ apiTransactionId: string }>;
    expect(data).toHaveLength(2);
    expect(data[0]!.apiTransactionId).not.toBe(data[1]!.apiTransactionId);
  });

  it("reimportar la misma cartola no inserta nada (ya hay 2 filas con esa huella)", async () => {
    txFindMany.mockResolvedValueOnce([dbRow("x"), dbRow("y")]);

    const r = await importBankTransactions("t1", "a1", [row, { ...row }], null);
    expect(createMany).not.toHaveBeenCalled();
    expect(r.importedCount).toBe(0);
    expect(r.duplicateCount).toBe(2);
  });

  it("si el proveedor ya trajo una de las dos, la cartola agrega solo la que falta", async () => {
    txFindMany.mockResolvedValueOnce([dbRow("from-web4leads")]);
    createMany.mockResolvedValueOnce({ count: 1 });

    const r = await importBankTransactions("t1", "a1", [row, { ...row }], null);
    expect(r.importedCount).toBe(1);
    expect(r.duplicateCount).toBe(1);
  });

  it("registra el cierre y los saldos diarios como lecturas IMPORT (no fija el saldo)", async () => {
    txFindMany.mockResolvedValueOnce([]);
    createMany.mockResolvedValueOnce({ count: 2 });

    await importBankTransactions("t1", "a1", [row, { ...row }], 5_000_000, undefined, {
      fileName: "cartola.xlsx",
      fileSize: 10,
      bankFormat: "SANTANDER",
      periodTo: "2026-09-07",
      openingBalance: 4_392_464,
      dailyBalances: [
        { date: "2026-09-06", balance: 4_392_464 },
        { date: "2026-09-07", balance: 5_000_000 },
      ],
    });

    const created = createSnapshot.mock.calls.map((c) => c[0].data as { source: string; asOfDate: Date; balance: unknown });
    expect(created.every((c) => c.source === "IMPORT")).toBe(true);
    // 06-sep (saldo diario) + 07-sep (cierre; el diario del mismo día no se repite)
    expect(created.map((c) => c.asOfDate.toISOString().slice(0, 10))).toEqual([
      "2026-09-06",
      "2026-09-07",
    ]);
    expect(importCreate.mock.calls[0][0].data.openingBalance).toBeDefined();
  });
});

describe("previewBankStatementImport", () => {
  it("clasifica por ocurrencias: la segunda copia es nueva si en BD hay una sola", async () => {
    txFindMany
      .mockResolvedValueOnce([dbRow("x")]) // content rows
      .mockResolvedValueOnce([]); // apiTransactionId existentes
    const p = await previewBankStatementImport("t1", "a1", [row, { ...row }], {});
    expect(p.newCount).toBe(1);
    expect(p.duplicateCount).toBe(1);
  });
});
