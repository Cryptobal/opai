import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    financeBankAccount: { findMany: vi.fn() },
    financeBankAccountBalance: { findFirst: vi.fn() },
    financeBankTransaction: { aggregate: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { resolveOpeningBalance } from "../opening-balance.service";

const findMany = prisma.financeBankAccount.findMany as unknown as ReturnType<typeof vi.fn>;
const findFirst = prisma.financeBankAccountBalance.findFirst as unknown as ReturnType<typeof vi.fn>;
const aggregate = prisma.financeBankTransaction.aggregate as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  findMany.mockReset();
  findFirst.mockReset();
  aggregate.mockReset();
});

describe("resolveOpeningBalance", () => {
  it("usa currentBalance cuando no hay snapshot", async () => {
    findMany.mockResolvedValueOnce([
      { id: "a1", bankName: "X", accountNumber: "1", currentBalance: 1_000_000 },
    ]);
    findFirst.mockResolvedValueOnce(null);

    const r = await resolveOpeningBalance("t1");
    expect(r.totalClp).toBe(1_000_000);
    expect(r.perAccount[0].anchorSnapshotDate).toBeNull();
    expect(r.perAccount[0].txDeltaClp).toBe(0);
    expect(r.perAccount[0].resolvedBalanceClp).toBe(1_000_000);
  });

  it("aplica delta de tx desde el snapshot", async () => {
    findMany.mockResolvedValueOnce([
      { id: "a1", bankName: "X", accountNumber: "1", currentBalance: 0 },
    ]);
    findFirst.mockResolvedValueOnce({
      asOfDate: new Date("2026-05-01"),
      balance: 500_000,
    });
    aggregate.mockResolvedValueOnce({
      _sum: { amount: 150_000 },
      _count: { _all: 3 },
    });

    const r = await resolveOpeningBalance("t1", new Date("2026-05-12"));
    expect(r.totalClp).toBe(650_000);
    expect(r.perAccount[0].txDeltaClp).toBe(150_000);
    expect(r.perAccount[0].txCount).toBe(3);
    expect(r.perAccount[0].anchorBalanceClp).toBe(500_000);
  });

  it("suma múltiples cuentas", async () => {
    findMany.mockResolvedValueOnce([
      { id: "a1", bankName: "X", accountNumber: "1", currentBalance: 0 },
      { id: "a2", bankName: "Y", accountNumber: "2", currentBalance: 0 },
    ]);
    findFirst.mockResolvedValue({
      asOfDate: new Date("2026-05-01"),
      balance: 100_000,
    });
    aggregate.mockResolvedValue({ _sum: { amount: 50_000 }, _count: { _all: 1 } });

    const r = await resolveOpeningBalance("t1");
    expect(r.totalClp).toBe(300_000);
    expect(r.perAccount.length).toBe(2);
  });

  it("maneja currentBalance null", async () => {
    findMany.mockResolvedValueOnce([
      { id: "a1", bankName: "X", accountNumber: "1", currentBalance: null },
    ]);
    findFirst.mockResolvedValueOnce(null);
    const r = await resolveOpeningBalance("t1");
    expect(r.totalClp).toBe(0);
  });

  it("maneja sum nulo cuando no hay tx posteriores", async () => {
    findMany.mockResolvedValueOnce([
      { id: "a1", bankName: "X", accountNumber: "1", currentBalance: 0 },
    ]);
    findFirst.mockResolvedValueOnce({
      asOfDate: new Date("2026-05-01"),
      balance: 100_000,
    });
    aggregate.mockResolvedValueOnce({
      _sum: { amount: null },
      _count: { _all: 0 },
    });
    const r = await resolveOpeningBalance("t1");
    expect(r.totalClp).toBe(100_000);
    expect(r.perAccount[0].txDeltaClp).toBe(0);
    expect(r.perAccount[0].txCount).toBe(0);
  });

  // El endpoint POST /bank-balance/adjust crea un snapshot con
  // source=MANUAL y asOfDate=hoy. La query `findFirst` ordena por
  // `asOfDate desc, createdAt desc` así que el último MANUAL siempre
  // gana sobre cartolas (IMPORT) anteriores. Validamos ese contrato.
  it("usa el snapshot más reciente como ancla (MANUAL gana al ser el último)", async () => {
    findMany.mockResolvedValueOnce([
      { id: "a1", bankName: "X", accountNumber: "1", currentBalance: 999 },
    ]);
    // Simula el orderBy del service: el findFirst devuelve el snapshot
    // más reciente. Si el usuario acaba de hacer un ajuste MANUAL hoy
    // con balance=12_500_000, ese es el que llega.
    findFirst.mockResolvedValueOnce({
      asOfDate: new Date("2026-05-13"),
      balance: 12_500_000,
    });
    aggregate.mockResolvedValueOnce({
      _sum: { amount: null },
      _count: { _all: 0 },
    });

    const r = await resolveOpeningBalance("t1", new Date("2026-05-13"));
    expect(r.perAccount[0].anchorBalanceClp).toBe(12_500_000);
    expect(r.perAccount[0].resolvedBalanceClp).toBe(12_500_000);
    expect(r.totalClp).toBe(12_500_000);
    // El query debe traer el último por asOfDate desc, createdAt desc.
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ asOfDate: "desc" }, { createdAt: "desc" }],
      }),
    );
  });
});
