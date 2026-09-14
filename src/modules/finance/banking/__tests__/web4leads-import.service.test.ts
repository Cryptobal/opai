import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    financeBankTransaction: {
      findMany: vi.fn(),
      createMany: vi.fn(),
      updateMany: vi.fn(),
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
    registerBankReading: vi.fn(),
    syncCurrentBalanceFromMovements: vi.fn(),
  };
});

import { prisma } from "@/lib/prisma";
import {
  registerBankReading,
  syncCurrentBalanceFromMovements,
} from "@/modules/finance/banking/bank-balance.service";
import { importWeb4leadsMovements } from "../web4leads-import.service";

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;
const findMany = asMock(prisma.financeBankTransaction.findMany);
const createMany = asMock(prisma.financeBankTransaction.createMany);
const updateMany = asMock(prisma.financeBankTransaction.updateMany);
const updateAccount = asMock(prisma.financeBankAccount.update);
const readingMock = asMock(registerBankReading);
const syncBal = asMock(syncCurrentBalanceFromMovements);

const baseMov = {
  externalId: "w4l-1",
  transactionDate: "2026-08-04",
  description: "SCF SERVICIOS F",
  reference: "77460259-3",
  amount: 7_000_000,
};

const dbRow = (id: string, balance: number | null = null) => ({
  id,
  transactionDate: new Date("2026-08-04T00:00:00.000Z"),
  amount: 7_000_000,
  description: "SCF SERVICIOS F",
  reference: "77460259-3",
  balance,
});

const insertedRow = (id: string, extra: Partial<ReturnType<typeof dbRow>> & { dupSuspectOfId?: string | null } = {}) => ({
  ...dbRow(id),
  dupSuspectOfId: null,
  ...extra,
});

describe("importWeb4leadsMovements", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateAccount.mockResolvedValue({});
    updateMany.mockResolvedValue({ count: 0 });
    syncBal.mockResolvedValue({ resolvedBalanceClp: 18_646_796 });
    readingMock.mockResolvedValue({
      ok: true,
      discrepancy: {
        reported: 18_646_796,
        computed: 18_646_796,
        delta: 0,
        exceeds: false,
        thresholdClp: 100_000,
        asOfDate: "2026-09-09",
        evaluable: true,
      },
      resolvedBalanceClp: 18_646_796,
      needsOpening: false,
      bootstrappedOpening: false,
      snapshot: { id: "snap-1" },
    });
  });

  it("una idéntica a otra ya guardada (id nuevo, sin saldo) se inserta como posible duplicado — no se pierde", async () => {
    findMany
      .mockResolvedValueOnce([]) // existing by externalId
      .mockResolvedValueOnce([dbRow("db-1")]) // content rows
      .mockResolvedValueOnce([insertedRow("tx-new", { dupSuspectOfId: "db-1" })]);
    createMany.mockResolvedValueOnce({ count: 1 });

    const r = await importWeb4leadsMovements({
      tenantId: "t1",
      bankAccountId: "a1",
      movements: [{ ...baseMov, externalId: "w4l-NEW" }],
    });

    expect(createMany).toHaveBeenCalledTimes(1);
    const payload = createMany.mock.calls[0][0];
    expect(payload.data).toHaveLength(1);
    expect(payload.data[0].apiTransactionId).toBe("web4leads:w4l-NEW");
    expect(payload.data[0].dupSuspectOfId).toBe("db-1");
    expect(r.imported).toBe(1);
    expect(r.suspects).toBe(1);
    expect(r.duplicates).toBe(0);
  });

  it("idéntica con el mismo saldo tras el movimiento se descarta (misma operación)", async () => {
    findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([dbRow("db-1", 25_000_000)]);

    const r = await importWeb4leadsMovements({
      tenantId: "t1",
      bankAccountId: "a1",
      movements: [{ ...baseMov, externalId: "w4l-COPY", balance: 25_000_000 }],
    });
    expect(createMany).not.toHaveBeenCalled();
    expect(r.imported).toBe(0);
    expect(r.duplicates).toBe(1);
  });

  it("7 copias idénticas con ids distintos en un POST: se insertan las 7 y las 6 extra quedan a revisar", async () => {
    const inserted = ["1", "2", "3", "4", "5", "6", "7"].map((i) => insertedRow(`tx-${i}`));
    findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(inserted);
    createMany.mockResolvedValueOnce({ count: 7 });
    updateMany.mockResolvedValueOnce({ count: 6 });

    const r = await importWeb4leadsMovements({
      tenantId: "t1",
      bankAccountId: "a1",
      movements: ["a", "b", "c", "d", "e", "f", "g"].map((s) => ({ ...baseMov, externalId: `w4l-${s}` })),
    });

    expect(createMany.mock.calls[0][0].data).toHaveLength(7);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: "t1", id: { in: ["tx-2", "tx-3", "tx-4", "tx-5", "tx-6", "tx-7"] } },
        data: { dupSuspectOfId: "tx-1" },
      }),
    );
    expect(r.imported).toBe(7);
    expect(r.suspects).toBe(6);
    expect(syncBal).toHaveBeenCalledWith("t1", "a1");
    expect(r.syncedBalance).toBe(18_646_796);
  });

  it("7 transferencias reales con saldos encadenados distintos: se insertan sin marca", async () => {
    const inserted = [1, 2, 3, 4, 5, 6, 7].map((i) =>
      insertedRow(`tx-${i}`, { balance: 10_000_000 + i * 7_000_000 } as never),
    );
    findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce(inserted);
    createMany.mockResolvedValueOnce({ count: 7 });

    const r = await importWeb4leadsMovements({
      tenantId: "t1",
      bankAccountId: "a1",
      movements: [1, 2, 3, 4, 5, 6, 7].map((i) => ({
        ...baseMov,
        externalId: `w4l-${i}`,
        balance: 10_000_000 + i * 7_000_000,
      })),
    });
    expect(createMany.mock.calls[0][0].data).toHaveLength(7);
    expect(updateMany).not.toHaveBeenCalled();
    expect(r.suspects).toBe(0);
  });

  it("si viene accountBalance registra una lectura CALCULATED (no fija el saldo)", async () => {
    findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const r = await importWeb4leadsMovements({
      tenantId: "t1",
      bankAccountId: "a1",
      movements: [],
      accountBalance: { current: 18_646_796, asOf: "2026-09-09T15:00:00Z" },
    });

    expect(createMany).not.toHaveBeenCalled();
    expect(readingMock).toHaveBeenCalledWith(
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

  it("prioriza accountBalance sobre el hint del movimiento", async () => {
    findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([insertedRow("tx-1")]);
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

    expect(readingMock).toHaveBeenCalledWith(
      expect.objectContaining({ balance: 18_646_796, asOf: "2026-09-09" }),
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
