import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    financeBankTransaction: {
      findMany: vi.fn(),
      createMany: vi.fn(),
    },
    financeBankAccountBalance: { findFirst: vi.fn() },
    financeBankAccount: { findFirst: vi.fn(), update: vi.fn() },
    financeCashflowConfig: { findUnique: vi.fn() },
  },
}));

vi.mock("@/modules/finance/banking/bank-balance.service", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/modules/finance/banking/bank-balance.service")
  >();
  return {
    ...actual,
    applyReportedBalance: vi.fn(),
    setBalanceSnapshot: vi.fn(),
    syncCurrentBalanceFromMovements: vi.fn(),
  };
});

import { prisma } from "@/lib/prisma";
import {
  applyReportedBalance,
  syncCurrentBalanceFromMovements,
} from "@/modules/finance/banking/bank-balance.service";
import { importWeb4leadsMovements } from "../web4leads-import.service";

const findMany = prisma.financeBankTransaction.findMany as unknown as ReturnType<
  typeof vi.fn
>;
const createMany = prisma.financeBankTransaction.createMany as unknown as ReturnType<
  typeof vi.fn
>;
const updateAccount = prisma.financeBankAccount.update as unknown as ReturnType<
  typeof vi.fn
>;
const applyBal = applyReportedBalance as unknown as ReturnType<typeof vi.fn>;
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
    updateAccount.mockReset();
    applyBal.mockReset();
    syncBal.mockReset();
    updateAccount.mockResolvedValue({});
    syncBal.mockResolvedValue({ resolvedBalanceClp: 18_646_796 });
    applyBal.mockResolvedValue({
      ok: true,
      discrepancy: {
        reported: 18_646_796,
        computed: 18_646_796,
        delta: 0,
        exceeds: false,
        thresholdClp: 100_000,
        asOfDate: "2026-09-09",
      },
      resolvedBalanceClp: 18_646_796,
      appliedAsAnchor: true,
      snapshot: { id: "snap-1" },
    });
  });

  it("inserta un id nuevo aunque la huella ya exista 1 vez (ocurrencia extra)", async () => {
    findMany
      .mockResolvedValueOnce([]) // existing by externalId
      .mockResolvedValueOnce([
        {
          transactionDate: new Date("2026-08-04T00:00:00.000Z"),
          amount: 7_000_000,
          description: "SCF SERVICIOS F",
          reference: "77460259-3",
        },
      ]) // existing content (count=1)
      .mockResolvedValueOnce([{ id: "tx-new" }]);
    createMany.mockResolvedValueOnce({ count: 1 });

    const r = await importWeb4leadsMovements({
      tenantId: "t1",
      bankAccountId: "a1",
      movements: [
        { ...baseMov, externalId: "keep" },
        { ...baseMov, externalId: "w4l-NEW" },
      ],
    });

    expect(createMany).toHaveBeenCalledTimes(1);
    const payload = createMany.mock.calls[0][0];
    expect(payload.data).toHaveLength(1);
    expect(payload.data[0].apiTransactionId).toBe("web4leads:w4l-NEW");
    expect(r.imported).toBe(1);
    expect(r.duplicates).toBe(1);
  });

  it("inserta las 7 copias idénticas con ids distintos", async () => {
    findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: "tx-1" },
        { id: "tx-2" },
        { id: "tx-3" },
        { id: "tx-4" },
        { id: "tx-5" },
        { id: "tx-6" },
        { id: "tx-7" },
      ]);
    createMany.mockResolvedValueOnce({ count: 7 });

    const r = await importWeb4leadsMovements({
      tenantId: "t1",
      bankAccountId: "a1",
      movements: [
        { ...baseMov, externalId: "w4l-a" },
        { ...baseMov, externalId: "w4l-b" },
        { ...baseMov, externalId: "w4l-c" },
        { ...baseMov, externalId: "w4l-d" },
        { ...baseMov, externalId: "w4l-e" },
        { ...baseMov, externalId: "w4l-f" },
        { ...baseMov, externalId: "w4l-g" },
      ],
    });

    expect(createMany).toHaveBeenCalledTimes(1);
    expect(createMany.mock.calls[0][0].data).toHaveLength(7);
    expect(syncBal).toHaveBeenCalledWith("t1", "a1");
    expect(r.imported).toBe(7);
    expect(r.duplicates).toBe(0);
    expect(r.syncedBalance).toBe(18_646_796);
  });

  it("si viene accountBalance ancla y syncedBalance es el resuelto", async () => {
    findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const r = await importWeb4leadsMovements({
      tenantId: "t1",
      bankAccountId: "a1",
      movements: [],
      accountBalance: { current: 18_646_796, asOf: "2026-09-09T15:00:00Z" },
    });

    expect(createMany).not.toHaveBeenCalled();
    expect(applyBal).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "t1",
        bankAccountId: "a1",
        asOf: "2026-09-09T15:00:00Z",
        balance: 18_646_796,
        source: "CALCULATED",
      }),
    );
    expect(r.imported).toBe(0);
    expect(r.syncedBalance).toBe(18_646_796);
    expect(r.discrepancy?.delta).toBe(0);
  });

  it("prioriza accountBalance sobre hint de movimiento", async () => {
    findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "tx-1" }]);
    createMany.mockResolvedValueOnce({ count: 1 });

    await importWeb4leadsMovements({
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
      accountBalance: { current: 18_646_796, asOf: "2026-09-09" },
    });

    expect(applyBal).toHaveBeenCalledWith(
      expect.objectContaining({
        balance: 18_646_796,
        asOf: "2026-09-09",
      }),
    );
  });

  it("lote vacío sin accountBalance no toca la cuenta", async () => {
    const r = await importWeb4leadsMovements({
      tenantId: "t1",
      bankAccountId: "a1",
      movements: [],
    });
    expect(updateAccount).not.toHaveBeenCalled();
    expect(r.syncedBalance).toBeNull();
    expect(r.discrepancy).toBeNull();
  });
});
