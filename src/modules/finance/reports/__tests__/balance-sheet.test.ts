import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    financeJournalLine: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { getBalanceSheet } from "../balance-sheet.service";

const linesMock = prisma.financeJournalLine.findMany as unknown as ReturnType<
  typeof vi.fn
>;

const dec = (n: number) => ({ toNumber: () => n });
const acc = (id: string, code: string, name: string, type: string) => ({
  id,
  code,
  name,
  type,
});

beforeEach(() => {
  linesMock.mockReset();
});

describe("getBalanceSheet", () => {
  it("computes balanced sheet (Activo = Pasivo + Patrimonio)", async () => {
    linesMock.mockResolvedValueOnce([
      // ASSET 1101 (current) — debit 200
      { debit: dec(200), credit: dec(0), account: acc("a1", "1101", "Caja", "ASSET") },
      // ASSET 1201 (non-current) — debit 300
      { debit: dec(300), credit: dec(0), account: acc("a2", "1201", "Maquinaria", "ASSET") },
      // LIABILITY 2101 (current) — credit 150
      { debit: dec(0), credit: dec(150), account: acc("l1", "2101", "Cuentas por pagar", "LIABILITY") },
      // EQUITY 3101 — credit 350
      { debit: dec(0), credit: dec(350), account: acc("e1", "3101", "Capital", "EQUITY") },
    ]);

    const r = await getBalanceSheet("t1", "2026-12-31");
    expect(r.asset.current.total).toBe(200);
    expect(r.asset.nonCurrent.total).toBe(300);
    expect(r.asset.total).toBe(500);
    expect(r.liability.current.total).toBe(150);
    expect(r.liability.total).toBe(150);
    expect(r.equity.total).toBe(350);
    expect(r.imbalance).toBe(0);
    expect(r.isBalanced).toBe(true);
  });

  it("flags imbalanced sheet", async () => {
    linesMock.mockResolvedValueOnce([
      { debit: dec(500), credit: dec(0), account: acc("a1", "1101", "Caja", "ASSET") },
      { debit: dec(0), credit: dec(100), account: acc("l1", "2101", "Pagos", "LIABILITY") },
      // Missing equity → imbalance 400
    ]);
    const r = await getBalanceSheet("t1", "2026-12-31");
    expect(r.isBalanced).toBe(false);
    expect(r.imbalance).toBe(400);
  });

  it("excludes accounts with zero balance from items but counts in totals", async () => {
    linesMock.mockResolvedValueOnce([
      { debit: dec(100), credit: dec(100), account: acc("a1", "1101", "Caja", "ASSET") }, // net 0
      { debit: dec(50), credit: dec(0), account: acc("a2", "1102", "Banco", "ASSET") },
    ]);
    const r = await getBalanceSheet("t1", "2026-12-31");
    expect(r.asset.current.items).toHaveLength(1);
    expect(r.asset.current.items[0].accountCode).toBe("1102");
    expect(r.asset.current.total).toBe(50);
  });
});
