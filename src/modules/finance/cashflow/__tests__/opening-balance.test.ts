import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    financeBankAccount: { findMany: vi.fn(), findFirst: vi.fn() },
    financeBankAccountBalance: { findMany: vi.fn(), findFirst: vi.fn() },
    financeBankTransaction: { aggregate: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { resolveOpeningBalance } from "../opening-balance.service";

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;
const findMany = asMock(prisma.financeBankAccount.findMany);
const findAccountFirst = asMock(prisma.financeBankAccount.findFirst);
const findOpening = asMock(prisma.financeBankAccountBalance.findFirst);
const findReadings = asMock(prisma.financeBankAccountBalance.findMany);
const aggregate = asMock(prisma.financeBankTransaction.aggregate);

const opening = (asOfDate: string, balance: number) => ({
  id: `o-${asOfDate}`,
  asOfDate: new Date(`${asOfDate}T00:00:00.000Z`),
  balance,
  note: null,
  createdAt: new Date(`${asOfDate}T12:00:00Z`),
});

beforeEach(() => {
  vi.clearAllMocks();
  findReadings.mockResolvedValue([]);
});

describe("resolveOpeningBalance (Banco hoy = libro mayor)", () => {
  it("sin saldo inicial usa currentBalance y marca needsOpening", async () => {
    findMany.mockResolvedValueOnce([
      { id: "a1", bankName: "X", accountNumber: "1", currentBalance: 1_000_000 },
    ]);
    findAccountFirst.mockResolvedValueOnce({ currentBalance: 1_000_000 });
    findOpening.mockResolvedValueOnce(null);

    const r = await resolveOpeningBalance("t1");
    expect(r.totalClp).toBe(1_000_000);
    expect(r.perAccount[0].anchorSnapshotDate).toBeNull();
    expect(r.perAccount[0].txDeltaClp).toBe(0);
    expect(r.perAccount[0].resolvedBalanceClp).toBe(1_000_000);
    expect(r.perAccount[0].anchorSource).toBeNull();
    expect(r.perAccount[0].needsOpening).toBe(true);
    expect(r.perAccount[0].lastDiscrepancy).toBeNull();
    expect(aggregate).not.toHaveBeenCalled();
  });

  it("aplica delta de tx desde el saldo inicial", async () => {
    findMany.mockResolvedValueOnce([
      { id: "a1", bankName: "X", accountNumber: "1", currentBalance: 0 },
    ]);
    findAccountFirst.mockResolvedValueOnce({ currentBalance: 0 });
    findOpening.mockResolvedValueOnce(opening("2026-05-01", 500_000));
    aggregate.mockResolvedValueOnce({ _sum: { amount: 150_000 }, _count: { _all: 3 } });

    const r = await resolveOpeningBalance("t1", new Date("2026-05-12"));
    expect(r.totalClp).toBe(650_000);
    expect(r.perAccount[0].txDeltaClp).toBe(150_000);
    expect(r.perAccount[0].txCount).toBe(3);
    expect(r.perAccount[0].anchorBalanceClp).toBe(500_000);
    expect(r.perAccount[0].anchorSource).toBe("OPENING");
    expect(r.perAccount[0].needsOpening).toBe(false);
  });

  it("suma múltiples cuentas", async () => {
    findMany.mockResolvedValueOnce([
      { id: "a1", bankName: "X", accountNumber: "1", currentBalance: 0 },
      { id: "a2", bankName: "Y", accountNumber: "2", currentBalance: 0 },
    ]);
    findAccountFirst.mockResolvedValue({ currentBalance: 0 });
    findOpening.mockResolvedValue(opening("2026-05-01", 100_000));
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
    findOpening.mockResolvedValueOnce(null);
    const r = await resolveOpeningBalance("t1");
    expect(r.totalClp).toBe(0);
  });

  it("maneja sum nulo cuando no hay tx posteriores", async () => {
    findMany.mockResolvedValueOnce([
      { id: "a1", bankName: "X", accountNumber: "1", currentBalance: 0 },
    ]);
    findAccountFirst.mockResolvedValueOnce({ currentBalance: 0 });
    findOpening.mockResolvedValueOnce(opening("2026-05-01", 100_000));
    aggregate.mockResolvedValueOnce({ _sum: { amount: null }, _count: { _all: 0 } });
    const r = await resolveOpeningBalance("t1");
    expect(r.totalClp).toBe(100_000);
    expect(r.perAccount[0].txDeltaClp).toBe(0);
    expect(r.perAccount[0].txCount).toBe(0);
  });

  it("una lectura MANUAL de hoy no congela el día: se suman todos los movimientos posteriores al saldo inicial", async () => {
    findMany.mockResolvedValueOnce([
      { id: "santander", bankName: "Santander", accountNumber: "1", currentBalance: 0 },
    ]);
    findAccountFirst.mockResolvedValueOnce({ currentBalance: 0 });
    const openingDate = new Date("2026-08-23T00:00:00.000Z");
    findOpening.mockResolvedValueOnce(opening("2026-08-23", 24_773_797 - 24_024_231));
    // 24-ago: Embajada +24.024.231 (llegó después de que alguien "fijó" 24.773.797)
    // 25-ago: NTB +2.675.188 y egresos −520.000.
    aggregate.mockResolvedValueOnce({
      _sum: { amount: 24_024_231 + 2_155_188 },
      _count: { _all: 8 },
    });

    const r = await resolveOpeningBalance("t1", new Date("2026-08-25T16:00:00.000Z"));
    expect(r.currentTotalClp).toBe(26_928_985);
    const where = aggregate.mock.calls[0][0].where;
    expect(where.transactionDate).toEqual({
      gt: openingDate,
      lte: new Date("2026-08-25T00:00:00.000Z"),
    });
    expect(where.hiddenAt).toBeNull();
    expect(where.reconciliationStatus).toBeUndefined();
    expect(where.links).toBeUndefined();
    // Solo se consulta el OPENING: las lecturas no participan del saldo.
    expect(findOpening).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ source: "OPENING" }) }),
    );
  });

  it("expone la última discrepancia no explicada de 90 días", async () => {
    findMany.mockResolvedValueOnce([
      { id: "a1", bankName: "X", accountNumber: "1", currentBalance: 0 },
    ]);
    findAccountFirst.mockResolvedValueOnce({ currentBalance: 0 });
    findOpening.mockResolvedValueOnce(opening("2026-09-01", 10_876_796));
    aggregate.mockResolvedValueOnce({ _sum: { amount: null }, _count: { _all: 0 } });
    findReadings.mockResolvedValueOnce([
      {
        asOfDate: new Date("2026-09-09T00:00:00.000Z"),
        deltaClp: 7_770_000,
        balance: 18_646_796,
        computedBalance: 10_876_796,
      },
    ]);

    const r = await resolveOpeningBalance("t1", new Date("2026-09-09T16:00:00.000Z"));
    expect(r.perAccount[0].lastDiscrepancy).toEqual({
      asOfDate: "2026-09-09",
      deltaClp: 7_770_000,
    });
  });
});
