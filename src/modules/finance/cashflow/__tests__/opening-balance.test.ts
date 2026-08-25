import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    financeBankAccount: { findMany: vi.fn(), findFirst: vi.fn() },
    financeBankAccountBalance: { findMany: vi.fn() },
    financeBankTransaction: { aggregate: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { resolveOpeningBalance } from "../opening-balance.service";

const findMany = prisma.financeBankAccount.findMany as unknown as ReturnType<typeof vi.fn>;
const findAccountFirst = prisma.financeBankAccount.findFirst as unknown as ReturnType<
  typeof vi.fn
>;
const findSnapshots = prisma.financeBankAccountBalance.findMany as unknown as ReturnType<
  typeof vi.fn
>;
const aggregate = prisma.financeBankTransaction.aggregate as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  findMany.mockReset();
  findAccountFirst.mockReset();
  findSnapshots.mockReset();
  aggregate.mockReset();
});

describe("resolveOpeningBalance", () => {
  it("usa currentBalance cuando no hay snapshot", async () => {
    findMany.mockResolvedValueOnce([
      { id: "a1", bankName: "X", accountNumber: "1", currentBalance: 1_000_000 },
    ]);
    findAccountFirst.mockResolvedValueOnce({ currentBalance: 1_000_000 });
    findSnapshots.mockResolvedValueOnce([]);

    const r = await resolveOpeningBalance("t1");
    expect(r.totalClp).toBe(1_000_000);
    expect(r.perAccount[0].anchorSnapshotDate).toBeNull();
    expect(r.perAccount[0].txDeltaClp).toBe(0);
    expect(r.perAccount[0].resolvedBalanceClp).toBe(1_000_000);
  });

  it("aplica delta de tx desde el snapshot", async () => {
    findMany.mockResolvedValueOnce([
      { id: "a1", bankName: "X", accountNumber: "1", currentBalance: 0 },
    ]);
    findAccountFirst.mockResolvedValueOnce({ currentBalance: 0 });
    findSnapshots.mockResolvedValueOnce([
      {
        asOfDate: new Date("2026-05-01"),
        balance: 500_000,
        source: "IMPORT",
        createdAt: new Date("2026-05-01T12:00:00Z"),
      },
    ]);
    aggregate.mockResolvedValueOnce({
      _sum: { amount: 150_000 },
      _count: { _all: 3 },
    });

    const r = await resolveOpeningBalance("t1", new Date("2026-05-12"));
    expect(r.totalClp).toBe(650_000);
    expect(r.perAccount[0].txDeltaClp).toBe(150_000);
    expect(r.perAccount[0].txCount).toBe(3);
    expect(r.perAccount[0].anchorBalanceClp).toBe(500_000);
  });

  it("suma múltiples cuentas", async () => {
    findMany.mockResolvedValueOnce([
      { id: "a1", bankName: "X", accountNumber: "1", currentBalance: 0 },
      { id: "a2", bankName: "Y", accountNumber: "2", currentBalance: 0 },
    ]);
    findAccountFirst.mockResolvedValue({ currentBalance: 0 });
    findSnapshots.mockResolvedValue([
      {
        asOfDate: new Date("2026-05-01"),
        balance: 100_000,
        source: "MANUAL",
        createdAt: new Date("2026-05-01T12:00:00Z"),
      },
    ]);
    aggregate.mockResolvedValue({ _sum: { amount: 50_000 }, _count: { _all: 1 } });

    const r = await resolveOpeningBalance("t1");
    expect(r.totalClp).toBe(300_000);
    expect(r.perAccount.length).toBe(2);
  });

  it("maneja currentBalance null", async () => {
    findMany.mockResolvedValueOnce([
      { id: "a1", bankName: "X", accountNumber: "1", currentBalance: null },
    ]);
    findAccountFirst.mockResolvedValueOnce({ currentBalance: null });
    findSnapshots.mockResolvedValueOnce([]);
    const r = await resolveOpeningBalance("t1");
    expect(r.totalClp).toBe(0);
  });

  it("maneja sum nulo cuando no hay tx posteriores", async () => {
    findMany.mockResolvedValueOnce([
      { id: "a1", bankName: "X", accountNumber: "1", currentBalance: 0 },
    ]);
    findAccountFirst.mockResolvedValueOnce({ currentBalance: 0 });
    findSnapshots.mockResolvedValueOnce([
      {
        asOfDate: new Date("2026-05-01"),
        balance: 100_000,
        source: "IMPORT",
        createdAt: new Date("2026-05-01T12:00:00Z"),
      },
    ]);
    aggregate.mockResolvedValueOnce({
      _sum: { amount: null },
      _count: { _all: 0 },
    });
    const r = await resolveOpeningBalance("t1");
    expect(r.totalClp).toBe(100_000);
    expect(r.perAccount[0].txDeltaClp).toBe(0);
    expect(r.perAccount[0].txCount).toBe(0);
  });

  it("usa el snapshot más reciente como ancla (MANUAL gana en empate de fecha)", async () => {
    findMany.mockResolvedValueOnce([
      { id: "a1", bankName: "X", accountNumber: "1", currentBalance: 999 },
    ]);
    findAccountFirst.mockResolvedValueOnce({ currentBalance: 999 });
    findSnapshots.mockResolvedValueOnce([
      {
        asOfDate: new Date("2026-05-13"),
        balance: 3_999_000,
        source: "IMPORT",
        createdAt: new Date("2026-05-13T18:00:00Z"),
      },
      {
        asOfDate: new Date("2026-05-13"),
        balance: 12_500_000,
        source: "MANUAL",
        createdAt: new Date("2026-05-13T10:00:00Z"),
      },
    ]);
    aggregate.mockResolvedValueOnce({
      _sum: { amount: null },
      _count: { _all: 0 },
    });

    const r = await resolveOpeningBalance("t1", new Date("2026-05-13"));
    expect(r.perAccount[0].anchorBalanceClp).toBe(12_500_000);
    expect(r.perAccount[0].resolvedBalanceClp).toBe(12_500_000);
    expect(r.totalClp).toBe(12_500_000);
    expect(findSnapshots).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ asOfDate: "desc" }, { createdAt: "desc" }],
      }),
    );
  });

  it("ancla MANUAL: suma el crédito MATCHED con fecha = asOfDate (no lo tira el >)", async () => {
    findMany.mockResolvedValueOnce([
      { id: "santander", bankName: "Santander", accountNumber: "1", currentBalance: 0 },
    ]);
    findAccountFirst.mockResolvedValueOnce({ currentBalance: 0 });
    const snapDate = new Date("2026-08-24T00:00:00.000Z");
    findSnapshots.mockResolvedValueOnce([
      {
        asOfDate: snapDate,
        balance: 24_773_797,
        source: "MANUAL",
        createdAt: new Date("2026-08-24T17:47:54.904Z"),
      },
    ]);
    aggregate.mockResolvedValueOnce({
      _sum: { amount: 24_024_231 },
      _count: { _all: 1 },
    });

    const r = await resolveOpeningBalance("t1", new Date("2026-08-25T16:00:00.000Z"));
    expect(r.currentTotalClp).toBe(24_773_797 + 24_024_231);
    expect(r.perAccount[0].txDeltaClp).toBe(24_024_231);
    const where = aggregate.mock.calls[0][0].where;
    expect(where.transactionDate).toEqual({
      gte: snapDate,
      lte: expect.any(Date),
    });
    expect(where.hiddenAt).toBeNull();
    expect(where.reconciliationStatus).toBeUndefined();
    expect(where.links).toBeUndefined();
  });
});
