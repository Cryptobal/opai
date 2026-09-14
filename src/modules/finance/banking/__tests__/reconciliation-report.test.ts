import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    financeBankAccount: { findFirst: vi.fn() },
    financeBankAccountBalance: { findFirst: vi.fn(), findMany: vi.fn() },
    financeBankTransaction: { aggregate: vi.fn(), findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { buildReconciliationReport } from "../bank-balance.service";

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;
const findAccount = asMock(prisma.financeBankAccount.findFirst);
const findOpening = asMock(prisma.financeBankAccountBalance.findFirst);
const findReadings = asMock(prisma.financeBankAccountBalance.findMany);
const aggregate = asMock(prisma.financeBankTransaction.aggregate);
const findTx = asMock(prisma.financeBankTransaction.findMany);

const OPENING = {
  id: "o1",
  asOfDate: new Date("2026-09-10T00:00:00.000Z"),
  balance: 10_000_000,
  note: null,
  createdAt: new Date("2026-09-10T23:00:00Z"),
};

const tx = (
  id: string,
  date: string,
  amount: number,
  extra: Partial<{ description: string; balance: number | null; dupSuspectOfId: string | null; dupResolvedAt: Date | null }> = {},
) => ({
  id,
  transactionDate: new Date(`${date}T00:00:00.000Z`),
  amount,
  description: extra.description ?? `mov ${id}`,
  reference: null,
  balance: extra.balance ?? null,
  dupSuspectOfId: extra.dupSuspectOfId ?? null,
  dupResolvedAt: extra.dupResolvedAt ?? null,
});

const reading = (id: string, date: string, balance: number, source = "MANUAL") => ({
  id,
  asOfDate: new Date(`${date}T00:00:00.000Z`),
  source,
  balance,
  note: null,
  createdAt: new Date(`${date}T15:00:00Z`),
});

beforeEach(() => {
  vi.clearAllMocks();
  findAccount.mockResolvedValue({ currentBalance: 0 });
});

describe("buildReconciliationReport", () => {
  it("recalcula el ledger en vivo por fecha y detecta el día con diferencia", async () => {
    findOpening.mockResolvedValue(OPENING);
    // ledger hoy (resolveAccountBalanceFromMovements): 10M + 5M − 2M = 13M
    aggregate.mockResolvedValue({ _sum: { amount: 3_000_000 }, _count: { _all: 2 } });
    findReadings.mockResolvedValueOnce([
      reading("r2", "2026-09-14", 13_000_000),
      reading("r1", "2026-09-12", 15_000_000), // el banco tenía 15M, OPAI calculaba 15M → cuadra
      reading("r0", "2026-09-11", 14_000_000), // banco 14M vs OPAI 15M → falta un egreso de 1M ese día
    ]);
    findTx.mockResolvedValueOnce([
      tx("t1", "2026-09-11", 5_000_000),
      tx("t2", "2026-09-13", -2_000_000),
    ]);

    const r = await buildReconciliationReport("t1", "a1", { days: 30, asOf: "2026-09-14" });

    expect(r.needsOpening).toBe(false);
    expect(r.opening).toEqual({ id: "o1", asOfDate: "2026-09-10", balance: 10_000_000 });
    expect(r.ledgerTodayClp).toBe(13_000_000);

    const byId = new Map(r.readings.map((x) => [x.id, x]));
    expect(byId.get("r0")!.ledgerAtDate).toBe(15_000_000);
    expect(byId.get("r0")!.deltaClp).toBe(-1_000_000);
    expect(byId.get("r1")!.deltaClp).toBe(0);
    expect(byId.get("r2")!.ledgerAtDate).toBe(13_000_000);
    expect(byId.get("r2")!.deltaClp).toBe(0);

    expect(r.daysWithDelta).toEqual([
      {
        asOfDate: "2026-09-11",
        source: "MANUAL",
        readingBalance: 14_000_000,
        ledgerAtDate: 15_000_000,
        deltaClp: -1_000_000,
      },
    ]);
    expect(r.latestReading?.id).toBe("r2");
  });

  it("lista posibles duplicados pendientes y agrupa filas idénticas con la señal de mismo saldo", async () => {
    findOpening.mockResolvedValue(OPENING);
    aggregate.mockResolvedValue({ _sum: { amount: 0 }, _count: { _all: 0 } });
    findReadings.mockResolvedValueOnce([]);
    findTx.mockResolvedValueOnce([
      tx("a", "2026-09-12", 7_000_000, { description: "SCF", balance: 20_000_000 }),
      tx("b", "2026-09-12", 7_000_000, { description: "SCF", balance: 20_000_000, dupSuspectOfId: "a" }),
      tx("c", "2026-09-12", 7_000_000, { description: "SCF", balance: 27_000_000, dupSuspectOfId: "a", dupResolvedAt: new Date() }),
    ]);

    const r = await buildReconciliationReport("t1", "a1", { asOf: "2026-09-14" });
    expect(r.duplicateSuspects.map((s) => s.id)).toEqual(["b"]);
    expect(r.contentGroups).toHaveLength(1);
    expect(r.contentGroups[0]!.txIds).toEqual(["a", "b", "c"]);
    expect(r.contentGroups[0]!.sameBalance).toBe(false);
  });

  it("sin saldo inicial: lecturas sin cuadrar (ledgerAtDate null) y needsOpening", async () => {
    findOpening.mockResolvedValue(null);
    findReadings.mockResolvedValueOnce([reading("r1", "2026-09-12", 15_000_000)]);
    findTx.mockResolvedValueOnce([]);
    const r = await buildReconciliationReport("t1", "a1", { asOf: "2026-09-14" });
    expect(r.needsOpening).toBe(true);
    expect(r.readings[0]!.ledgerAtDate).toBeNull();
    expect(r.daysWithDelta).toEqual([]);
  });
});
