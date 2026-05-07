import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    financeJournalLine: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { getIncomeStatement } from "../income-statement.service";
import { buildPeriod } from "../shared/period.helper";

const linesMock = prisma.financeJournalLine.findMany as unknown as ReturnType<
  typeof vi.fn
>;

const dec = (n: number) => ({ toNumber: () => n });
const acc = (id: string, code: string, name: string, type: string, nature: string) => ({
  id,
  code,
  name,
  type,
  nature,
});

beforeEach(() => {
  linesMock.mockReset();
});

describe("getIncomeStatement", () => {
  it("partitions OPEX into financialResult (71/72) and taxes (81)", async () => {
    const period = buildPeriod("month", new Date(2026, 4, 15));
    linesMock.mockResolvedValue([
      // REVENUE 41xx — credit 100
      { debit: dec(0), credit: dec(100), costCenterId: null, accountId: "r1", account: acc("r1", "4101", "Ventas", "REVENUE", "CREDIT"), entry: { date: new Date() } },
      // COST 51xx — debit 30
      { debit: dec(30), credit: dec(0), costCenterId: null, accountId: "c1", account: acc("c1", "5101", "Costo serv.", "COST", "DEBIT"), entry: { date: new Date() } },
      // EXPENSE 6xx generic opex — debit 15
      { debit: dec(15), credit: dec(0), costCenterId: null, accountId: "e1", account: acc("e1", "6201", "Sueldos", "EXPENSE", "DEBIT"), entry: { date: new Date() } },
      // EXPENSE 7101 financial — debit 5
      { debit: dec(5), credit: dec(0), costCenterId: null, accountId: "e2", account: acc("e2", "7101", "Intereses", "EXPENSE", "DEBIT"), entry: { date: new Date() } },
      // EXPENSE 8101 taxes — debit 10
      { debit: dec(10), credit: dec(0), costCenterId: null, accountId: "e3", account: acc("e3", "8101", "Impto. renta", "EXPENSE", "DEBIT"), entry: { date: new Date() } },
    ]);

    const r = await getIncomeStatement("t1", period);
    expect(r.revenue.total).toBe(100);
    expect(r.cogs.total).toBe(30);
    expect(r.grossProfit).toBe(70);
    expect(r.opex.total).toBe(15);
    expect(r.ebitda).toBe(55);
    expect(r.financialResult.total).toBe(5);
    expect(r.beforeTax).toBe(50);
    expect(r.taxes.total).toBe(10);
    expect(r.netIncome).toBe(40);
  });

  it("returns zeros when no posted lines exist", async () => {
    const period = buildPeriod("month", new Date());
    linesMock.mockResolvedValue([]);
    const r = await getIncomeStatement("t1", period);
    expect(r.revenue.total).toBe(0);
    expect(r.netIncome).toBe(0);
  });

  it("withComparison populates prevAmount per item", async () => {
    const period = buildPeriod("month", new Date(2026, 4, 15));
    // Two calls (current + prev) — return identical shape
    linesMock
      .mockResolvedValueOnce([
        { debit: dec(0), credit: dec(200), costCenterId: null, accountId: "r1", account: acc("r1", "4101", "Ventas", "REVENUE", "CREDIT"), entry: { date: new Date() } },
      ])
      .mockResolvedValueOnce([
        { debit: dec(0), credit: dec(100), costCenterId: null, accountId: "r1", account: acc("r1", "4101", "Ventas", "REVENUE", "CREDIT"), entry: { date: new Date() } },
      ]);

    const r = await getIncomeStatement("t1", period, {}, { withComparison: true });
    expect(r.revenue.total).toBe(200);
    expect(r.revenue.prevTotal).toBe(100);
    expect(r.revenue.items[0].prevAmount).toBe(100);
    expect(r.comparison?.prev).toBeDefined();
  });
});
