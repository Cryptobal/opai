import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    financeBankAccount: { findFirst: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    financeBankAccountBalance: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    financeBankTransaction: { aggregate: vi.fn(), findMany: vi.fn() },
    financeCashflowConfig: { findUnique: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { todayInChile, utcDateFromYmd } from "@/lib/dates-cl";
import {
  ledgerCutoffYmd,
  resolveAccountBalanceFromMovements,
  syncCurrentBalanceFromMovements,
  registerBankReading,
  setOpeningBalance,
  resolveTenantBankLedgerAsOf,
} from "../bank-balance.service";

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;
const findAccount = asMock(prisma.financeBankAccount.findFirst);
const updateAccount = asMock(prisma.financeBankAccount.update);
const findAccounts = asMock(prisma.financeBankAccount.findMany);
const findOpening = asMock(prisma.financeBankAccountBalance.findFirst);
const findSnapshots = asMock(prisma.financeBankAccountBalance.findMany);
const createSnapshot = asMock(prisma.financeBankAccountBalance.create);
const aggregate = asMock(prisma.financeBankTransaction.aggregate);
const findConfig = asMock(prisma.financeCashflowConfig.findUnique);

const OPENING = {
  id: "open-1",
  asOfDate: new Date("2026-09-13T00:00:00.000Z"),
  balance: 30_000_000,
  note: null,
  createdAt: new Date("2026-09-13T23:00:00Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  findAccount.mockResolvedValue({ id: "a1", currentBalance: 999 });
  updateAccount.mockResolvedValue({});
  findSnapshots.mockResolvedValue([]);
  findConfig.mockResolvedValue({ bankBalanceDiscrepancyThresholdClp: 100_000 });
  createSnapshot.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
    id: `snap-${createSnapshot.mock.calls.length}`,
    ...args.data,
    createdAt: new Date(),
  }));
});

describe("ledgerCutoffYmd", () => {
  it("sin valor usa hoy en Chile", () => {
    expect(ledgerCutoffYmd()).toBe(todayInChile());
  });
  it("YYYY-MM-DD se conserva", () => {
    expect(ledgerCutoffYmd("2026-09-14")).toBe("2026-09-14");
  });
  it("Date de medianoche UTC (fecha pura) usa su fecha UTC", () => {
    expect(ledgerCutoffYmd(new Date("2026-09-14T00:00:00.000Z"))).toBe("2026-09-14");
  });
  it("Date con hora usa el calendario Chile", () => {
    // 02:00Z del 15 = 22:00/23:00 del 14 en Santiago.
    expect(ledgerCutoffYmd(new Date("2026-09-15T02:00:00.000Z"))).toBe("2026-09-14");
  });
});

describe("resolveAccountBalanceFromMovements (libro mayor)", () => {
  it("sin saldo inicial devuelve currentBalance y needsOpening", async () => {
    findOpening.mockResolvedValueOnce(null);
    const r = await resolveAccountBalanceFromMovements("t1", "a1");
    expect(r.needsOpening).toBe(true);
    expect(r.resolvedBalanceClp).toBe(999);
    expect(r.anchorSource).toBeNull();
    expect(aggregate).not.toHaveBeenCalled();
  });

  it("saldo = OPENING + Σ movimientos visibles posteriores (gt) y ≤ corte", async () => {
    findOpening.mockResolvedValueOnce({ ...OPENING, asOfDate: new Date("2026-06-30T00:00:00.000Z"), balance: 22_312_708 });
    aggregate.mockResolvedValueOnce({ _sum: { amount: 2_191_733 }, _count: { _all: 195 } });

    const r = await resolveAccountBalanceFromMovements("t1", "a1", "2026-09-14");
    expect(r.resolvedBalanceClp).toBe(24_504_441);
    expect(r.txDeltaClp).toBe(2_191_733);
    expect(r.anchorSource).toBe("OPENING");
    expect(r.needsOpening).toBe(false);
    expect(findOpening).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ source: "OPENING" }) }),
    );
    const where = aggregate.mock.calls[0][0].where;
    expect(where.hiddenAt).toBeNull();
    expect(where.transactionDate).toEqual({
      gt: new Date("2026-06-30T00:00:00.000Z"),
      lte: utcDateFromYmd("2026-09-14"),
    });
    expect(where).not.toHaveProperty("reconciliationStatus");
  });

  it("los movimientos del mismo día del saldo inicial no se vuelven a sumar", async () => {
    findOpening.mockResolvedValueOnce(OPENING);
    aggregate.mockResolvedValueOnce({ _sum: { amount: null }, _count: { _all: 0 } });
    const r = await resolveAccountBalanceFromMovements("t1", "a1", "2026-09-13");
    expect(r.resolvedBalanceClp).toBe(30_000_000);
    expect(aggregate.mock.calls[0][0].where.transactionDate.gt).toEqual(OPENING.asOfDate);
  });
});

describe("registerBankReading — las lecturas no mueven el saldo", () => {
  it("fijar saldo a las 09:00 y un egreso a las 11:00 del mismo día: OPAI sigue al banco", async () => {
    // 09:00 — la app muestra 31.234.701 (OPENING ayer 30M + abono hoy 1.234.701).
    findOpening.mockResolvedValue(OPENING);
    aggregate.mockResolvedValue({ _sum: { amount: 1_234_701 }, _count: { _all: 1 } });

    const reading = await registerBankReading({
      tenantId: "t1",
      userId: "u1",
      bankAccountId: "a1",
      asOf: "2026-09-14",
      balance: 31_234_701,
      source: "MANUAL",
    });
    expect(reading.ok).toBe(true);
    if (!reading.ok) return;
    expect(reading.discrepancy.delta).toBe(0);
    expect(reading.bootstrappedOpening).toBe(false);
    // Solo se crea la lectura (MANUAL); jamás un OPENING nuevo.
    expect(createSnapshot).toHaveBeenCalledTimes(1);
    expect(createSnapshot.mock.calls[0][0].data.source).toBe("MANUAL");
    expect(Number(createSnapshot.mock.calls[0][0].data.deltaClp)).toBe(0);

    // 11:00 — llega un egreso de 10.600.647 con fecha de hoy.
    aggregate.mockResolvedValue({
      _sum: { amount: 1_234_701 - 10_600_647 },
      _count: { _all: 2 },
    });
    const r = await resolveAccountBalanceFromMovements("t1", "a1", "2026-09-14");
    expect(r.resolvedBalanceClp).toBe(20_634_054);
  });

  it("lectura con diferencia: guarda computed/delta y currentBalance queda en el ledger, no en la lectura", async () => {
    findOpening.mockResolvedValue(OPENING);
    aggregate.mockResolvedValue({ _sum: { amount: -9_365_946 }, _count: { _all: 12 } });

    const r = await registerBankReading({
      tenantId: "t1",
      userId: "u1",
      bankAccountId: "a1",
      asOf: "2026-09-14T14:36:00.000Z",
      balance: 31_234_701,
      source: "MANUAL",
      note: "app Santander",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.discrepancy.computed).toBe(20_634_054);
    expect(r.discrepancy.delta).toBe(10_600_647);
    expect(r.discrepancy.exceeds).toBe(true);
    expect(r.resolvedBalanceClp).toBe(20_634_054);
    const data = createSnapshot.mock.calls[0][0].data;
    expect(Number(data.computedBalance)).toBe(20_634_054);
    expect(Number(data.deltaClp)).toBe(10_600_647);
    const lastUpdate = updateAccount.mock.calls.at(-1)?.[0].data as { currentBalance: unknown };
    expect(Number(lastUpdate.currentBalance)).toBe(20_634_054);
  });

  it("exige nota si |delta| ≥ umbral y no crea nada", async () => {
    findOpening.mockResolvedValue(OPENING);
    aggregate.mockResolvedValue({ _sum: { amount: 0 }, _count: { _all: 0 } });
    const r = await registerBankReading({
      tenantId: "t1",
      userId: "u1",
      bankAccountId: "a1",
      asOf: "2026-09-14",
      balance: 40_000_000,
      source: "MANUAL",
      requireNoteIfExceeds: true,
    });
    expect(r.ok).toBe(false);
    expect(createSnapshot).not.toHaveBeenCalled();
  });

  it("cuenta sin saldo inicial: cierre de cartola (IMPORT) inicializa el ledger", async () => {
    findOpening.mockResolvedValueOnce(null).mockResolvedValue(OPENING);
    aggregate.mockResolvedValue({ _sum: { amount: 0 }, _count: { _all: 0 } });
    const r = await registerBankReading({
      tenantId: "t1",
      userId: null,
      bankAccountId: "a1",
      asOf: "2026-09-13",
      balance: 30_000_000,
      source: "IMPORT",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.bootstrappedOpening).toBe(true);
    const sources = createSnapshot.mock.calls.map((c) => c[0].data.source);
    expect(sources).toEqual(["OPENING", "IMPORT"]);
  });

  it("cuenta sin saldo inicial: una lectura MANUAL de hoy NO inicializa (sería intradía)", async () => {
    findOpening.mockResolvedValue(null);
    const r = await registerBankReading({
      tenantId: "t1",
      userId: "u1",
      bankAccountId: "a1",
      asOf: todayInChile(),
      balance: 31_234_701,
      source: "MANUAL",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.bootstrappedOpening).toBe(false);
    expect(r.needsOpening).toBe(true);
    expect(r.discrepancy.evaluable).toBe(false);
    expect(r.discrepancy.exceeds).toBe(false);
    expect(createSnapshot).toHaveBeenCalledTimes(1);
    expect(createSnapshot.mock.calls[0][0].data.source).toBe("MANUAL");
    expect(createSnapshot.mock.calls[0][0].data.deltaClp).toBeNull();
    expect(updateAccount).not.toHaveBeenCalled();
  });
});

describe("setOpeningBalance", () => {
  it("rechaza hoy o futuro (debe ser un día cerrado)", async () => {
    await expect(
      setOpeningBalance("t1", "u1", { bankAccountId: "a1", asOfDate: todayInChile(), balance: 1 }),
    ).rejects.toThrow(/día ya terminado/);
    expect(createSnapshot).not.toHaveBeenCalled();
  });

  it("crea OPENING y resincroniza el cache", async () => {
    findOpening.mockResolvedValue(OPENING);
    aggregate.mockResolvedValue({ _sum: { amount: 500 }, _count: { _all: 1 } });
    const r = await setOpeningBalance("t1", "u1", {
      bankAccountId: "a1",
      asOfDate: "2026-09-13",
      balance: 30_000_000,
      note: "cartola",
    });
    expect(createSnapshot.mock.calls[0][0].data.source).toBe("OPENING");
    expect(r.resolved.resolvedBalanceClp).toBe(30_000_500);
    expect(updateAccount).toHaveBeenCalled();
  });
});

describe("syncCurrentBalanceFromMovements", () => {
  it("persiste el ledger cuando hay saldo inicial", async () => {
    findOpening.mockResolvedValueOnce(OPENING);
    aggregate.mockResolvedValueOnce({ _sum: { amount: 50 }, _count: { _all: 2 } });
    const r = await syncCurrentBalanceFromMovements("t1", "a1");
    expect(r.resolvedBalanceClp).toBe(30_000_050);
    expect(updateAccount).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "a1" } }),
    );
  });

  it("no persiste sin saldo inicial", async () => {
    findOpening.mockResolvedValueOnce(null);
    await syncCurrentBalanceFromMovements("t1", "a1");
    expect(updateAccount).not.toHaveBeenCalled();
  });
});

describe("resolveTenantBankLedgerAsOf", () => {
  it("suma el ledger de las cuentas CLP activas a la fecha", async () => {
    findAccounts.mockResolvedValueOnce([{ id: "a1" }, { id: "a2" }]);
    findOpening
      .mockResolvedValueOnce({ ...OPENING, balance: 1_000_000 })
      .mockResolvedValueOnce({ ...OPENING, balance: 500_000 });
    aggregate
      .mockResolvedValueOnce({ _sum: { amount: 200_000 }, _count: { _all: 1 } })
      .mockResolvedValueOnce({ _sum: { amount: -50_000 }, _count: { _all: 1 } });
    const total = await resolveTenantBankLedgerAsOf("t1", new Date("2026-09-14T00:00:00.000Z"));
    expect(total).toBe(1_650_000);
  });
});
