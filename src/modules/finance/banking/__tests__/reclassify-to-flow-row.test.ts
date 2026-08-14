/**
 * reclassifyTransactionToFlowRow — update in-place de links MATCHED EXPENSE/INCOME.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";

const prismaMock = vi.hoisted(() => ({
  financeBankTransactionLink: {
    findMany: vi.fn(),
    update: vi.fn(),
  },
  financeBankTransaction: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  financeBankAccount: {
    findFirst: vi.fn(),
  },
  $transaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("../../accounting/journal-entry.service", () => ({
  createManualEntry: vi.fn(),
}));

vi.mock("../cost-allocation.service", () => ({
  replaceLinkAllocations: vi.fn(),
  loadAllocationsForLinks: vi.fn(async () => new Map()),
}));

import * as bankTxLinkService from "../bank-tx-link.service";

const TENANT = "tenant-gard";
const TX_ID = "47179088-36b3-4593-a15f-fe5255a3d0eb";
const LINK_ID = "0aa1bdd8-2fa0-4dcb-80b6-0005faa4c33c";
const ROW_DEVOL = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const PLAN = "plan-acreedores-003";

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation(
    async (fn: (tx: typeof prismaMock) => Promise<void>) => fn(prismaMock),
  );
});

describe("canReclassifyToFlowRow", () => {
  it("permite EXPENSE/INCOME y rechaza DTE", () => {
    expect(bankTxLinkService.canReclassifyToFlowRow([{ targetType: "EXPENSE" }])).toBe(
      true,
    );
    expect(bankTxLinkService.canReclassifyToFlowRow([{ targetType: "INCOME" }])).toBe(
      true,
    );
    expect(
      bankTxLinkService.canReclassifyToFlowRow([{ targetType: "DTE_RECEIVED" }]),
    ).toBe(false);
    expect(bankTxLinkService.canReclassifyToFlowRow([])).toBe(true);
  });
});

describe("reclassifyTransactionToFlowRow", () => {
  it("update in-place persiste flowRowId Devolución (mismo link id)", async () => {
    prismaMock.financeBankTransactionLink.findMany.mockResolvedValue([
      {
        id: LINK_ID,
        targetType: "EXPENSE",
        amount: new Decimal(2_000_000),
      },
    ]);

    const result = await bankTxLinkService.reclassifyTransactionToFlowRow(
      TENANT,
      TX_ID,
      null,
      {
        targetType: "EXPENSE",
        amount: 2_000_000,
        accountPlanId: PLAN,
        flowRowId: ROW_DEVOL,
        note: "Clasificado a fila flujo: Devolución a socios",
        matchSource: "MANUAL",
      },
    );

    expect(result.mode).toBe("updated");
    expect(result.linkIds).toEqual([LINK_ID]);
    expect(prismaMock.financeBankTransactionLink.update).toHaveBeenCalledWith({
      where: { id: LINK_ID },
      data: expect.objectContaining({
        flowRowId: ROW_DEVOL,
        accountPlanId: PLAN,
        note: "Clasificado a fila flujo: Devolución a socios",
        matchSource: "MANUAL",
      }),
    });
    expect(prismaMock.financeBankTransaction.update).toHaveBeenCalledWith({
      where: { id: TX_ID },
      data: { reconciliationStatus: "MATCHED" },
    });
  });

  it("SPLIT reemplaza allocations del link (no acumula)", async () => {
    const { replaceLinkAllocations } = await import("../cost-allocation.service");
    prismaMock.financeBankTransactionLink.findMany.mockResolvedValue([
      {
        id: LINK_ID,
        targetType: "EXPENSE",
        amount: new Decimal(100_000),
      },
    ]);
    prismaMock.financeBankTransaction.findFirst.mockResolvedValue({
      transactionDate: new Date("2026-08-01"),
    });

    const assignment = {
      mode: "SPLIT" as const,
      driver: "EQUAL" as const,
      installations: [
        { installationId: "11111111-1111-4111-8111-111111111111" },
        { installationId: "22222222-2222-4222-8222-222222222222" },
      ],
    };

    await bankTxLinkService.reclassifyTransactionToFlowRow(TENANT, TX_ID, null, {
      targetType: "EXPENSE",
      amount: 100_000,
      accountPlanId: PLAN,
      flowRowId: ROW_DEVOL,
      costCenter: assignment,
    });

    expect(replaceLinkAllocations).toHaveBeenCalledTimes(1);
    expect(replaceLinkAllocations).toHaveBeenCalledWith(
      prismaMock,
      expect.objectContaining({
        tenantId: TENANT,
        linkId: LINK_ID,
        linkAmount: 100_000,
        assignment,
      }),
    );
  });

  it("sin costCenter no toca allocations (retrocompat)", async () => {
    const { replaceLinkAllocations } = await import("../cost-allocation.service");
    vi.mocked(replaceLinkAllocations).mockClear();
    prismaMock.financeBankTransactionLink.findMany.mockResolvedValue([
      {
        id: LINK_ID,
        targetType: "EXPENSE",
        amount: new Decimal(2_000_000),
      },
    ]);

    await bankTxLinkService.reclassifyTransactionToFlowRow(TENANT, TX_ID, null, {
      targetType: "EXPENSE",
      amount: 2_000_000,
      accountPlanId: PLAN,
      flowRowId: ROW_DEVOL,
    });

    expect(replaceLinkAllocations).not.toHaveBeenCalled();
  });
});
