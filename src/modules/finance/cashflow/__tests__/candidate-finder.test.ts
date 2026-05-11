import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => {
  const financeBankTransaction = { findFirst: vi.fn() };
  const financeCashflowOccurrence = { findMany: vi.fn() };
  const crmInstallation = { findMany: vi.fn() };
  const financeCashflowConfig = {
    findUnique: vi.fn(),
    create: vi.fn(),
  };
  const financeCashflowCategoryAccount = { findMany: vi.fn() };
  return {
    prisma: {
      financeBankTransaction,
      financeCashflowOccurrence,
      crmInstallation,
      financeCashflowConfig,
      financeCashflowCategoryAccount,
    },
  };
});

import { prisma } from "@/lib/prisma";
import { findCashflowOccurrenceCandidates } from "../candidate-finder";

const TENANT = "tenant-1";

beforeEach(() => {
  vi.clearAllMocks();
  (prisma.financeCashflowConfig.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
    tenantId: TENANT,
    matchAmountToleranceClp: 5000,
    matchDaysTolerance: 3,
  });
  (prisma.crmInstallation.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (prisma.financeCashflowCategoryAccount.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
});

describe("findCashflowOccurrenceCandidates", () => {
  it("ordena candidatos por confidence desc", async () => {
    (prisma.financeBankTransaction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      amount: { toString: () => "-300000" },
      transactionDate: new Date("2026-05-11"),
      links: [],
    });
    // Mock: Number(amount) → necesitamos un Decimal-like que Number() pueda parsear
    (prisma.financeBankTransaction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      amount: -300000,
      transactionDate: new Date("2026-05-11"),
      links: [],
    });
    (prisma.financeCashflowOccurrence.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: "occ-1",
        scheduledDate: new Date("2026-05-08"),
        effectiveDate: null,
        amountClp: 250000,
        item: {
          id: "item-1",
          name: "Telefonía Entel",
          kind: "EXPENSE",
          installationId: null,
          categoryId: "cat-tel",
          category: { id: "cat-tel", code: "EGR_TELEFONIA", name: "Telefonía" },
        },
      },
      {
        id: "occ-2",
        scheduledDate: new Date("2026-05-28"),
        effectiveDate: null,
        amountClp: 185000,
        item: {
          id: "item-2",
          name: "Internet oficina",
          kind: "EXPENSE",
          installationId: null,
          categoryId: "cat-tel",
          category: { id: "cat-tel", code: "EGR_TELEFONIA", name: "Telefonía" },
        },
      },
    ]);

    const result = await findCashflowOccurrenceCandidates(TENANT, "tx-1");
    expect(result.length).toBe(2);
    expect(result[0].itemId).toBe("item-1"); // mejor match (monto y fecha más cercana)
    expect(result[0].confidence).toBeGreaterThan(result[1].confidence);
  });

  it("retorna [] si no hay tx", async () => {
    (prisma.financeBankTransaction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const result = await findCashflowOccurrenceCandidates(TENANT, "no-existe");
    expect(result).toEqual([]);
  });
});
