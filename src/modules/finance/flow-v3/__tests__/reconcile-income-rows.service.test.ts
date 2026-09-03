import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/modules/finance/cashflow/category.service", () => ({
  seedSystemCategoriesForTenant: vi.fn().mockResolvedValue(undefined),
}));
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
let updateManySpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  updateManySpy = vi.fn().mockResolvedValue({ count: 0 });
  asMock(prisma.$transaction).mockImplementation(async (cb: (tx: typeof prisma) => Promise<void>) => {
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(undefined),
      financeFlowRow: {
        ...prisma.financeFlowRow,
        updateMany: updateManySpy,
        update: vi.fn().mockResolvedValue({}),
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      financeDteRecurringTemplate: { findMany: vi.fn().mockResolvedValue([]) },
      financeFlowPlanCell: { findMany: vi.fn().mockResolvedValue([]) },
      financeCashflowCategory: { findMany: vi.fn().mockResolvedValue([]) },
      financeCashflowConfig: prisma.financeCashflowConfig,
      financeDte: prisma.financeDte,
      crmAccount: prisma.crmAccount,
      financeFlowRowAccount: {
        count: vi.fn().mockResolvedValue(0),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        createMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
      financeAccountPlan: { findMany: vi.fn().mockResolvedValue([]) },
      financeBankTransactionLink: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
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

  it("DTE OTHER_INCOME pendiente no crea fila ACCOUNT_INSTALLATION", async () => {
    asMock(prisma.crmAccount.findMany).mockResolvedValue([
      { id: "acc-oi", name: "Esporádico", rut: "76.999.999-9" },
    ]);
    asMock(prisma.financeDte.findMany).mockResolvedValue([
      {
        crmAccountId: "acc-oi",
        receiverRut: null,
        totalAmount: 100_000,
        amountPaid: 0,
        date: new Date("2026-08-01T12:00:00Z"),
        flowRouting: "OTHER_INCOME",
      },
    ]);

    await reconcileIncomeRows(TENANT);

    const pendingCreates = asMock(prisma.financeFlowRow.create).mock.calls.filter(
      (c) => c[0]?.data?.mapping === "ACCOUNT_INSTALLATION" && c[0]?.data?.crmAccountId === "acc-oi",
    );
    expect(pendingCreates).toHaveLength(0);
  });

  it("DTE OWN_ROW pendiente crea fila y no la archiva en el mismo pase", async () => {
    let created = false;
    const createdRow = {
      id: "row-own",
      name: "Cliente Beta",
      crmAccountId: "acc-own",
      installationId: null,
      recurringTemplateId: null,
      createdAt: new Date("2026-08-01T12:00:00Z"),
    };
    asMock(prisma.crmAccount.findMany).mockResolvedValue([
      { id: "acc-own", name: "Cliente Beta", rut: "76.111.111-1" },
    ]);
    asMock(prisma.financeDte.findMany).mockResolvedValue([
      {
        crmAccountId: "acc-own",
        receiverRut: null,
        totalAmount: 80_000,
        amountPaid: 0,
        date: new Date("2026-08-01T12:00:00Z"),
        flowRouting: "OWN_ROW",
      },
    ]);
    asMock(prisma.financeFlowRow.create).mockImplementation(async () => {
      created = true;
      return createdRow;
    });
    asMock(prisma.financeFlowRow.findMany).mockImplementation(async (args) => {
      if (
        args?.where?.mapping === "ACCOUNT_INSTALLATION" &&
        args?.where?.archivedAt === null &&
        args?.select?.id
      ) {
        // archiveSurplusRows: ve la fila recién creada
        return created ? [createdRow] : [];
      }
      return [];
    });

    await reconcileIncomeRows(TENANT);

    expect(prisma.financeFlowRow.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          crmAccountId: "acc-own",
          mapping: "ACCOUNT_INSTALLATION",
        }),
      }),
    );
    // Sin archive: updateMany no debe incluir row-own (ni correr si archiveIds vacío).
    const archivedIds = updateManySpy.mock.calls.flatMap(
      (c) => (c[0]?.where?.id?.in as string[] | undefined) ?? [],
    );
    expect(archivedIds).not.toContain("row-own");
  });

  it("DTE con flowRouting null conserva comportamiento actual (crea fila)", async () => {
    asMock(prisma.crmAccount.findMany).mockResolvedValue([
      { id: "acc-null", name: "Legacy", rut: "76.222.222-2" },
    ]);
    asMock(prisma.financeDte.findMany).mockResolvedValue([
      {
        crmAccountId: "acc-null",
        receiverRut: null,
        totalAmount: 40_000,
        amountPaid: 0,
        date: new Date("2026-08-01T12:00:00Z"),
        flowRouting: null,
      },
    ]);

    await reconcileIncomeRows(TENANT);

    expect(prisma.financeFlowRow.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          crmAccountId: "acc-null",
          mapping: "ACCOUNT_INSTALLATION",
        }),
      }),
    );
  });
});

describe("archiveSurplusRows (via reconcileIncomeRows)", () => {
  const poetasRow = {
    id: "row-poetas",
    name: "Ametel - Los Poetas",
    crmAccountId: "acc-A",
    installationId: "inst-poetas",
    recurringTemplateId: "tpl-poetas",
    createdAt: new Date("2026-01-01T00:00:00Z"),
  };

  it("no rearchiva fila cuyo borrador vive en otra plantilla pero misma instalación", async () => {
    asMock(prisma.financeFlowRow.findMany).mockImplementation(async (args) => {
      if (args?.where?.mapping === "ACCOUNT_INSTALLATION" && args?.select?.installationId) {
        return [poetasRow];
      }
      return [];
    });
    asMock(prisma.financeDte.findMany).mockImplementation(async (args) => {
      if (args?.where?.OR) {
        return [{
          recurringTemplateId: "tpl-pena",
          installationId: "inst-poetas",
        }];
      }
      return [];
    });

    await reconcileIncomeRows(TENANT);

    const archivedIds = updateManySpy.mock.calls.flatMap(
      (c) => (c[0]?.where?.id?.in as string[] | undefined) ?? [],
    );
    expect(archivedIds).not.toContain("row-poetas");
  });

  it("archiva sobrante sin template activo, plan ni DTE vivo", async () => {
    asMock(prisma.financeFlowRow.findMany).mockImplementation(async (args) => {
      if (args?.where?.mapping === "ACCOUNT_INSTALLATION" && args?.select?.installationId) {
        return [poetasRow];
      }
      return [];
    });
    asMock(prisma.financeDte.findMany).mockResolvedValue([]);

    await reconcileIncomeRows(TENANT);

    const archivedIds = updateManySpy.mock.calls.flatMap(
      (c) => (c[0]?.where?.id?.in as string[] | undefined) ?? [],
    );
    expect(archivedIds).toContain("row-poetas");
  });
});
