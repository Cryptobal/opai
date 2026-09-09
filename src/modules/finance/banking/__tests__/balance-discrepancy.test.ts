import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  applyReportedBalance,
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

const findAccount = prisma.financeBankAccount.findFirst as unknown as ReturnType<
  typeof vi.fn
>;
const findSnapshots = prisma.financeBankAccountBalance.findMany as unknown as ReturnType<
  typeof vi.fn
>;
const aggregate = prisma.financeBankTransaction.aggregate as unknown as ReturnType<
  typeof vi.fn
>;
const findConfig = prisma.financeCashflowConfig.findUnique as unknown as ReturnType<
  typeof vi.fn
>;
const createSnap = prisma.financeBankAccountBalance.create as unknown as ReturnType<
  typeof vi.fn
>;

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

describe("resolveAndEvaluateBalanceDiscrepancy — caso 04–09/09", () => {
  beforeEach(() => {
    findAccount.mockReset();
    findSnapshots.mockReset();
    aggregate.mockReset();
    findConfig.mockReset();
    findConfig.mockResolvedValue({ bankBalanceDiscrepancyThresholdClp: 100_000 });
  });

  it("con 7 SCF incluidas, delta dentro de ±1M y no notifica", async () => {
    findAccount.mockResolvedValueOnce({ currentBalance: 0 });
    findSnapshots.mockResolvedValueOnce([
      {
        asOfDate: new Date("2026-09-04T00:00:00.000Z"),
        balance: 30_167_412,
        source: "CALCULATED",
        createdAt: new Date("2026-09-04T12:00:00Z"),
      },
    ]);
    // computed = 30_167_412 + txDelta. Para empatar 18_646_796:
    aggregate.mockResolvedValueOnce({
      _sum: { amount: 18_646_796 - 30_167_412 },
      _count: { _all: 40 },
    });

    const d = await resolveAndEvaluateBalanceDiscrepancy({
      tenantId: "t1",
      bankAccountId: "a1",
      asOf: "2026-09-09",
      reportedBalance: 18_646_796,
    });

    expect(Math.abs(d.delta)).toBeLessThanOrEqual(1_000_000);
    expect(d.exceeds).toBe(false);
    expect(d.computed).toBe(18_646_796);
  });
});

describe("applyReportedBalance", () => {
  beforeEach(() => {
    findAccount.mockReset();
    findSnapshots.mockReset();
    aggregate.mockReset();
    findConfig.mockReset();
    createSnap.mockReset();
    findConfig.mockResolvedValue({ bankBalanceDiscrepancyThresholdClp: 100_000 });
    findAccount.mockResolvedValue({ currentBalance: 0, id: "a1" });
    findSnapshots.mockResolvedValue([]);
  });

  it("exige nota si |delta| ≥ umbral", async () => {
    const r = await applyReportedBalance({
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
