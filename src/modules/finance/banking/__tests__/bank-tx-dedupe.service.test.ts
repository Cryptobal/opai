import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    financeBankTransaction: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { findContentDuplicateGroups } from "../bank-tx-dedupe.service";

const findMany = prisma.financeBankTransaction.findMany as unknown as ReturnType<
  typeof vi.fn
>;

const row = (
  id: string,
  extra: Partial<{
    apiTransactionId: string | null;
    balance: number | null;
    reconciliationStatus: string;
    createdAt: Date;
    amount: number;
  }> = {},
) => ({
  id,
  transactionDate: new Date("2026-09-07T00:00:00.000Z"),
  amount: extra.amount ?? 7_000_000,
  description: "SCF SERVICIOS F",
  reference: "77460259-3",
  balance: extra.balance ?? null,
  apiTransactionId: extra.apiTransactionId ?? null,
  createdAt: extra.createdAt ?? new Date("2026-09-07T10:00:00Z"),
  reconciliationStatus: extra.reconciliationStatus ?? "UNMATCHED",
});

describe("findContentDuplicateGroups", () => {
  beforeEach(() => {
    findMany.mockReset();
  });

  it("sin filas repetidas no propone nada y nunca oculta", async () => {
    findMany.mockResolvedValueOnce([row("1"), row("2", { amount: 100 })]);
    const groups = await findContentDuplicateGroups({ tenantId: "t1", bankAccountId: "a1" });
    expect(groups).toEqual([]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ hiddenAt: null }) }),
    );
  });

  it("agrupa filas idénticas aunque tengan ids de proveedor distintos (el usuario decide)", async () => {
    findMany.mockResolvedValueOnce([
      row("a", { apiTransactionId: "web4leads:mov_1", createdAt: new Date("2026-09-07T10:00:00Z") }),
      row("b", { apiTransactionId: "web4leads:mov_2", createdAt: new Date("2026-09-07T10:01:00Z"), reconciliationStatus: "MATCHED" }),
    ]);
    const groups = await findContentDuplicateGroups({ tenantId: "t1", bankAccountId: "a1" });
    expect(groups).toHaveLength(1);
    expect(groups[0]!.rows.map((r) => r.id)).toEqual(["a", "b"]);
    expect(groups[0]!.keeperId).toBe("b");
    expect(groups[0]!.sameBalance).toBe(false);
  });

  it("marca sameBalance cuando todas las filas traen el mismo saldo del banco (copia casi segura)", async () => {
    findMany.mockResolvedValueOnce([
      row("a", { balance: 25_000_000 }),
      row("b", { balance: 25_000_000 }),
    ]);
    const groups = await findContentDuplicateGroups({ tenantId: "t1", bankAccountId: "a1" });
    expect(groups[0]!.sameBalance).toBe(true);
  });

  it("saldos distintos = dos transferencias reales (sameBalance false)", async () => {
    findMany.mockResolvedValueOnce([
      row("a", { balance: 25_000_000 }),
      row("b", { balance: 32_000_000 }),
    ]);
    const groups = await findContentDuplicateGroups({ tenantId: "t1", bankAccountId: "a1" });
    expect(groups[0]!.sameBalance).toBe(false);
  });
});
