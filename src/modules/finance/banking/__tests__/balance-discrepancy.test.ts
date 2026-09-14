import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  registerBankReading,
  evaluateBalanceDiscrepancy,
  parseAsOfToChileYmd,
  resolveAndEvaluateBalanceDiscrepancy,
} from "../bank-balance.service";
import { DEFAULT_BANK_BALANCE_DISCREPANCY_THRESHOLD_CLP } from "../bank-balance-constants";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    financeBankAccount: { findFirst: vi.fn(), update: vi.fn() },
    financeBankAccountBalance: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    financeBankTransaction: { aggregate: vi.fn() },
    financeCashflowConfig: { findUnique: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;
const findAccount = asMock(prisma.financeBankAccount.findFirst);
const findOpening = asMock(prisma.financeBankAccountBalance.findFirst);
const aggregate = asMock(prisma.financeBankTransaction.aggregate);
const findConfig = asMock(prisma.financeCashflowConfig.findUnique);
const createSnap = asMock(prisma.financeBankAccountBalance.create);

describe("evaluateBalanceDiscrepancy", () => {
  it("delta exacto y umbral", () => {
    const d = evaluateBalanceDiscrepancy({
      reported: 18_646_796,
      computed: -15_637_402,
      thresholdClp: 100_000,
      asOfDate: "2026-09-09",
    });
    expect(d.delta).toBe(34_284_198);
    expect(d.exceeds).toBe(true);
    expect(d.evaluable).toBe(true);
  });

  it("bajo el umbral no excede", () => {
    const d = evaluateBalanceDiscrepancy({
      reported: 18_646_796,
      computed: 18_600_000,
      thresholdClp: 100_000,
      asOfDate: "2026-09-09",
    });
    expect(d.exceeds).toBe(false);
    expect(d.delta).toBe(46_796);
  });

  it("igual al umbral sí excede", () => {
    const d = evaluateBalanceDiscrepancy({
      reported: 200_000,
      computed: 100_000,
      thresholdClp: 100_000,
      asOfDate: "2026-09-09",
    });
    expect(d.exceeds).toBe(true);
    expect(d.thresholdClp).toBe(DEFAULT_BANK_BALANCE_DISCREPANCY_THRESHOLD_CLP);
  });

  it("no evaluable (sin saldo inicial) nunca excede", () => {
    const d = evaluateBalanceDiscrepancy({
      reported: 200_000,
      computed: 0,
      thresholdClp: 100_000,
      asOfDate: "2026-09-09",
      evaluable: false,
    });
    expect(d.exceeds).toBe(false);
    expect(d.evaluable).toBe(false);
  });
});

describe("parseAsOfToChileYmd", () => {
  it("YYYY-MM-DD se conserva", () => {
    expect(parseAsOfToChileYmd("2026-09-09")).toBe("2026-09-09");
  });

  it("ISO con hora usa calendario Chile", () => {
    const ymd = parseAsOfToChileYmd("2026-09-09T15:30:00.000Z");
    expect(ymd).toBe("2026-09-09");
  });
});

describe("resolveAndEvaluateBalanceDiscrepancy — caso 04–09/09 con las 7 SCF en el ledger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findConfig.mockResolvedValue({ bankBalanceDiscrepancyThresholdClp: 100_000 });
    findAccount.mockResolvedValue({ currentBalance: 0, id: "a1" });
  });

  it("con las 7 transferencias idénticas sumadas, el ledger cuadra con la lectura", async () => {
    findOpening.mockResolvedValueOnce({
      id: "o",
      asOfDate: new Date("2026-09-03T00:00:00.000Z"),
      balance: 30_167_412,
      note: null,
      createdAt: new Date(),
    });
    aggregate.mockResolvedValueOnce({
      _sum: { amount: 18_646_796 - 30_167_412 },
      _count: { _all: 47 },
    });

    const d = await resolveAndEvaluateBalanceDiscrepancy({
      tenantId: "t1",
      bankAccountId: "a1",
      asOf: "2026-09-09",
      reportedBalance: 18_646_796,
    });

    expect(d.delta).toBe(0);
    expect(d.exceeds).toBe(false);
    expect(d.computed).toBe(18_646_796);
  });

  it("si faltan 6 de las 7 SCF el delta es exactamente 6 × 7.000.000", async () => {
    findOpening.mockResolvedValueOnce({
      id: "o",
      asOfDate: new Date("2026-09-03T00:00:00.000Z"),
      balance: 30_167_412,
      note: null,
      createdAt: new Date(),
    });
    aggregate.mockResolvedValueOnce({
      _sum: { amount: 18_646_796 - 30_167_412 - 6 * 7_000_000 },
      _count: { _all: 41 },
    });
    const d = await resolveAndEvaluateBalanceDiscrepancy({
      tenantId: "t1",
      bankAccountId: "a1",
      asOf: "2026-09-09",
      reportedBalance: 18_646_796,
    });
    expect(d.delta).toBe(42_000_000);
    expect(d.exceeds).toBe(true);
  });
});

describe("registerBankReading", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findConfig.mockResolvedValue({ bankBalanceDiscrepancyThresholdClp: 100_000 });
    findAccount.mockResolvedValue({ currentBalance: 0, id: "a1" });
    findOpening.mockResolvedValue({
      id: "o",
      asOfDate: new Date("2026-09-01T00:00:00.000Z"),
      balance: 0,
      note: null,
      createdAt: new Date(),
    });
    aggregate.mockResolvedValue({ _sum: { amount: 0 }, _count: { _all: 0 } });
  });

  it("exige nota si |delta| ≥ umbral", async () => {
    const r = await registerBankReading({
      tenantId: "t1",
      userId: "u1",
      bankAccountId: "a1",
      asOf: "2026-09-09",
      balance: 18_646_796,
      source: "MANUAL",
      requireNoteIfExceeds: true,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe("note_required");
      expect(r.discrepancy.delta).toBe(18_646_796);
    }
    expect(createSnap).not.toHaveBeenCalled();
  });
});
