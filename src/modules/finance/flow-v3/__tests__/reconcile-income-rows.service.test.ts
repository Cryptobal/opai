import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
    financeCashflowConfig: { findUnique: vi.fn() },
    financeDte: { findMany: vi.fn() },
    financeFlowRow: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    crmAccount: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { reconcileIncomeRows } from "../reconcile-income-rows.service";

const TENANT = "tenant-1";
const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  asMock(prisma.$transaction).mockImplementation(async (cb: (tx: typeof prisma) => Promise<void>) => {
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(undefined),
      financeFlowRow: {
        ...prisma.financeFlowRow,
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        update: vi.fn().mockResolvedValue({}),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      financeDteRecurringTemplate: { findMany: vi.fn().mockResolvedValue([]) },
      financeFlowPlanCell: { findMany: vi.fn().mockResolvedValue([]) },
      financeCashflowCategory: { findMany: vi.fn().mockResolvedValue([]) },
      financeCashflowConfig: prisma.financeCashflowConfig,
      financeDte: prisma.financeDte,
      crmAccount: prisma.crmAccount,
    };
    return cb(tx as unknown as typeof prisma);
  });
  asMock(prisma.financeFlowRow.findMany).mockResolvedValue([]);
  asMock(prisma.financeFlowRow.findFirst).mockResolvedValue({ orderIndex: 0 });
  asMock(prisma.financeFlowRow.create).mockResolvedValue({ id: "row-new" });
  asMock(prisma.crmAccount.findMany).mockResolvedValue([]);
  asMock(prisma.financeCashflowConfig.findUnique).mockResolvedValue({ flowCutoffYmd: null });
  asMock(prisma.financeDte.findMany).mockResolvedValue([]);
});

describe("createRowsForAccountsWithPendingDtes (via reconcileIncomeRows)", () => {
  it("crea fila ACCOUNT_INSTALLATION para cuenta con DTE pendiente sin fila", async () => {
    asMock(prisma.crmAccount.findMany).mockResolvedValue([
      { id: "acc-1", name: "Cliente Alpha", rut: "76.123.456-7" },
    ]);
    asMock(prisma.financeDte.findMany).mockResolvedValue([
      {
        crmAccountId: "acc-1",
        receiverRut: null,
        totalAmount: 100_000,
        amountPaid: 0,
        date: new Date("2026-08-01T12:00:00Z"),
      },
    ]);

    await reconcileIncomeRows(TENANT);

    expect(prisma.financeFlowRow.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: TENANT,
          section: "INGRESOS",
          name: "Cliente Alpha",
          mapping: "ACCOUNT_INSTALLATION",
          crmAccountId: "acc-1",
          installationId: null,
        }),
      }),
    );
  });

  it("no crea fila si la cuenta ya tiene fila ACCOUNT_INSTALLATION activa", async () => {
    asMock(prisma.financeFlowRow.findMany).mockImplementation(async (args) => {
      if (args?.where?.mapping === "ACCOUNT_INSTALLATION") {
        return [
          {
            id: "row-existing",
            name: "Cliente Alpha",
            crmAccountId: "acc-1",
            installationId: null,
            recurringTemplateId: null,
            createdAt: new Date(),
          },
        ];
      }
      return [];
    });
    asMock(prisma.crmAccount.findMany).mockResolvedValue([
      { id: "acc-1", name: "Cliente Alpha", rut: "76.123.456-7" },
    ]);
    asMock(prisma.financeDte.findMany).mockResolvedValue([
      {
        crmAccountId: "acc-1",
        receiverRut: null,
        totalAmount: 50_000,
        amountPaid: 0,
        date: new Date("2026-08-01T12:00:00Z"),
      },
    ]);

    await reconcileIncomeRows(TENANT);

    const pendingCreates = asMock(prisma.financeFlowRow.create).mock.calls.filter(
      (c) => c[0]?.data?.mapping === "ACCOUNT_INSTALLATION" && c[0]?.data?.crmAccountId === "acc-1",
    );
    expect(pendingCreates).toHaveLength(0);
  });

  it("respeta flowCutoffYmd", async () => {
    asMock(prisma.financeCashflowConfig.findUnique).mockResolvedValue({
      flowCutoffYmd: new Date("2026-08-15T12:00:00Z"),
    });
    asMock(prisma.crmAccount.findMany).mockResolvedValue([
      { id: "acc-1", name: "Viejo", rut: "11111111-1" },
      { id: "acc-2", name: "Nuevo", rut: "22222222-2" },
    ]);
    asMock(prisma.financeDte.findMany).mockResolvedValue([
      {
        crmAccountId: "acc-1",
        receiverRut: null,
        totalAmount: 100_000,
        amountPaid: 0,
        date: new Date("2026-08-01T12:00:00Z"),
      },
      {
        crmAccountId: "acc-2",
        receiverRut: null,
        totalAmount: 200_000,
        amountPaid: 0,
        date: new Date("2026-08-20T12:00:00Z"),
      },
    ]);

    await reconcileIncomeRows(TENANT);

    const pendingCreates = asMock(prisma.financeFlowRow.create).mock.calls.filter(
      (c) => c[0]?.data?.mapping === "ACCOUNT_INSTALLATION" && c[0]?.data?.crmAccountId,
    );
    expect(pendingCreates).toHaveLength(1);
    expect(pendingCreates[0][0].data.crmAccountId).toBe("acc-2");
  });
});
