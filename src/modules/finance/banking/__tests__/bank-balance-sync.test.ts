import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    financeBankAccount: { findFirst: vi.fn(), update: vi.fn() },
    financeBankAccountBalance: { findFirst: vi.fn() },
    financeBankTransaction: { aggregate: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  resolveAccountBalanceFromMovements,
  syncCurrentBalanceFromMovements,
} from "../bank-balance.service";

const findAccount = prisma.financeBankAccount.findFirst as unknown as ReturnType<
  typeof vi.fn
>;
const updateAccount = prisma.financeBankAccount.update as unknown as ReturnType<
  typeof vi.fn
>;
const findSnapshot = prisma.financeBankAccountBalance.findFirst as unknown as ReturnType<
  typeof vi.fn
>;
const aggregate = prisma.financeBankTransaction.aggregate as unknown as ReturnType<
  typeof vi.fn
>;

beforeEach(() => {
  findAccount.mockReset();
  updateAccount.mockReset();
  findSnapshot.mockReset();
  aggregate.mockReset();
});

describe("resolveAccountBalanceFromMovements", () => {
  it("sin snapshot devuelve currentBalance", async () => {
    findAccount.mockResolvedValueOnce({ currentBalance: 1_000_000 });
    findSnapshot.mockResolvedValueOnce(null);

    const r = await resolveAccountBalanceFromMovements("t1", "a1");
    expect(r.resolvedBalanceClp).toBe(1_000_000);
    expect(r.txDeltaClp).toBe(0);
  });

  it("suma movimientos posteriores al snapshot", async () => {
    findAccount.mockResolvedValueOnce({ currentBalance: 0 });
    findSnapshot.mockResolvedValueOnce({
      asOfDate: new Date("2026-06-30"),
      balance: 22_312_708,
    });
    aggregate.mockResolvedValueOnce({
      _sum: { amount: 2_191_733 },
      _count: { _all: 195 },
    });

    const r = await resolveAccountBalanceFromMovements("t1", "a1");
    expect(r.resolvedBalanceClp).toBe(24_504_441);
    expect(r.txDeltaClp).toBe(2_191_733);
  });
});

describe("syncCurrentBalanceFromMovements", () => {
  it("persiste snapshot + movimientos cuando hay ancla", async () => {
    findAccount.mockResolvedValueOnce({ currentBalance: 0 });
    findSnapshot.mockResolvedValueOnce({
      asOfDate: new Date("2026-06-30"),
      balance: 100,
    });
    aggregate.mockResolvedValueOnce({
      _sum: { amount: 50 },
      _count: { _all: 2 },
    });
    updateAccount.mockResolvedValueOnce({});

    const r = await syncCurrentBalanceFromMovements("t1", "a1");
    expect(r.resolvedBalanceClp).toBe(150);
    expect(updateAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "a1" },
        data: expect.objectContaining({ currentBalance: expect.anything() }),
      }),
    );
  });

  it("no persiste si no hay snapshot", async () => {
    findAccount.mockResolvedValueOnce({ currentBalance: 999 });
    findSnapshot.mockResolvedValueOnce(null);

    await syncCurrentBalanceFromMovements("t1", "a1");
    expect(updateAccount).not.toHaveBeenCalled();
  });
});
