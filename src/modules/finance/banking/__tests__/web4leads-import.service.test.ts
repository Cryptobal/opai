import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    financeBankTransaction: {
      findMany: vi.fn(),
      createMany: vi.fn(),
    },
    financeBankAccountBalance: { findFirst: vi.fn() },
    financeBankAccount: { findFirst: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("@/modules/finance/banking/bank-balance.service", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/modules/finance/banking/bank-balance.service")
  >();
  return {
    ...actual,
    setBalanceSnapshot: vi.fn(),
    syncCurrentBalanceFromMovements: vi.fn(),
  };
});

import { prisma } from "@/lib/prisma";
import {
  setBalanceSnapshot,
  syncCurrentBalanceFromMovements,
} from "@/modules/finance/banking/bank-balance.service";
import { importWeb4leadsMovements } from "../web4leads-import.service";

const findMany = prisma.financeBankTransaction.findMany as unknown as ReturnType<
  typeof vi.fn
>;
const createMany = prisma.financeBankTransaction.createMany as unknown as ReturnType<
  typeof vi.fn
>;
const findManual = prisma.financeBankAccountBalance.findFirst as unknown as ReturnType<
  typeof vi.fn
>;
const findAccount = prisma.financeBankAccount.findFirst as unknown as ReturnType<
  typeof vi.fn
>;
const updateAccount = prisma.financeBankAccount.update as unknown as ReturnType<
  typeof vi.fn
>;
const setSnap = setBalanceSnapshot as unknown as ReturnType<typeof vi.fn>;
const syncBal = syncCurrentBalanceFromMovements as unknown as ReturnType<
  typeof vi.fn
>;

const baseMov = {
  externalId: "w4l-1",
  transactionDate: "2026-08-04",
  description: "SCF SERVICIOS F",
  reference: "77460259-3",
  amount: 7_000_000,
};

describe("importWeb4leadsMovements", () => {
  beforeEach(() => {
    findMany.mockReset();
    createMany.mockReset();
    findManual.mockReset();
    findAccount.mockReset();
    updateAccount.mockReset();
    setSnap.mockReset();
    syncBal.mockReset();
    updateAccount.mockResolvedValue({});
    syncBal.mockResolvedValue({ resolvedBalanceClp: 7_514_145 });
  });

  it("no inserta si la huella ya existe con otro externalId", async () => {
    findMany
      .mockResolvedValueOnce([]) // existing by externalId
      .mockResolvedValueOnce([
        {
          transactionDate: new Date("2026-08-04T00:00:00.000Z"),
          amount: 7_000_000,
          description: "SCF SERVICIOS F",
          reference: "77460259-3",
        },
      ]); // existing content

    const r = await importWeb4leadsMovements({
      tenantId: "t1",
      bankAccountId: "a1",
      movements: [{ ...baseMov, externalId: "w4l-NEW" }],
    });

    expect(createMany).not.toHaveBeenCalled();
    expect(r.imported).toBe(0);
    expect(r.duplicates).toBe(1);
    expect(updateAccount).toHaveBeenCalled();
  });

  it("colapsa copias del mismo POST y sincroniza saldo", async () => {
    findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "tx-1" }]);
    createMany.mockResolvedValueOnce({ count: 1 });

    const r = await importWeb4leadsMovements({
      tenantId: "t1",
      bankAccountId: "a1",
      movements: [
        { ...baseMov, externalId: "w4l-a" },
        { ...baseMov, externalId: "w4l-b" },
        { ...baseMov, externalId: "w4l-c" },
      ],
    });

    expect(createMany).toHaveBeenCalledTimes(1);
    const payload = createMany.mock.calls[0][0];
    expect(payload.data).toHaveLength(1);
    expect(payload.data[0].apiTransactionId).toBe("web4leads:w4l-a");
    expect(syncBal).toHaveBeenCalledWith("t1", "a1");
    expect(r.imported).toBe(1);
    expect(r.duplicates).toBe(2);
    expect(r.insertedIds).toEqual(["tx-1"]);
  });

  it("si viene balance y no hay MANUAL posterior, crea snapshot CALCULATED", async () => {
    findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "tx-1" }]);
    createMany.mockResolvedValueOnce({ count: 1 });
    findManual.mockResolvedValueOnce(null);
    setSnap.mockResolvedValueOnce({});
    findAccount.mockResolvedValueOnce({ currentBalance: 7_514_145 });

    const r = await importWeb4leadsMovements({
      tenantId: "t1",
      bankAccountId: "a1",
      movements: [
        {
          ...baseMov,
          amount: -40_000,
          transactionDate: "2026-09-03",
          externalId: "w4l-z",
          description: "Transf.Internet",
          reference: null,
          balance: 7_514_145,
        },
      ],
    });

    expect(createMany).toHaveBeenCalled();
    expect(setSnap).toHaveBeenCalledWith(
      "t1",
      null,
      expect.objectContaining({
        bankAccountId: "a1",
        asOfDate: "2026-09-03",
        balance: 7_514_145,
        source: "CALCULATED",
      }),
    );
    expect(syncBal).not.toHaveBeenCalled();
    expect(r.syncedBalance).toBe(7_514_145);
  });

  it("no pisa un MANUAL del mismo día con el balance de Web4Leads", async () => {
    findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "tx-1" }]);
    createMany.mockResolvedValueOnce({ count: 1 });
    findManual.mockResolvedValueOnce({ asOfDate: new Date("2026-09-03") });

    await importWeb4leadsMovements({
      tenantId: "t1",
      bankAccountId: "a1",
      movements: [
        {
          ...baseMov,
          transactionDate: "2026-09-03",
          amount: -40_000,
          description: "Transf",
          reference: null,
          balance: 7_514_145,
        },
      ],
    });

    expect(setSnap).not.toHaveBeenCalled();
    expect(syncBal).toHaveBeenCalled();
  });
});
