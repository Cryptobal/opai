import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    financeFlowRow: { findMany: vi.fn(), findFirst: vi.fn() },
    financeCashflowCategory: { findMany: vi.fn(), findFirst: vi.fn() },
    financeCashflowCategoryAccount: { findMany: vi.fn(), findFirst: vi.fn() },
    financeAccountPlan: { findMany: vi.fn(), findFirst: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  getFlowHealth,
  getFlowDestinationChain,
} from "../flow-health.service";

const TENANT = "t1";
const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getFlowHealth", () => {
  it("lista filas sin categoría (excepto bandejas)", async () => {
    asMock(prisma.financeFlowRow.findMany).mockResolvedValue([
      {
        id: "r1",
        name: "Retiro socios",
        section: "FINANCIAMIENTO",
        mapping: "MANUAL",
        categoryId: null,
      },
      {
        id: "r2",
        name: "Otros egresos",
        section: "GAV",
        mapping: "MANUAL",
        categoryId: null,
      },
      {
        id: "r3",
        name: "Sueldos líquidos",
        section: "REMUNERACIONES",
        mapping: "CATEGORY",
        categoryId: "c1",
      },
    ]);
    asMock(prisma.financeCashflowCategory.findMany).mockResolvedValue([
      {
        id: "c1",
        code: "EGR_SUELDO",
        name: "Sueldos",
        kind: "EXPENSE",
        accountPlanId: null,
      },
      {
        id: "c2",
        code: "EGR_TELEFONIA",
        name: "Telefonía",
        kind: "EXPENSE",
        accountPlanId: null,
      },
    ]);
    asMock(prisma.financeCashflowCategoryAccount.findMany).mockResolvedValue([
      {
        categoryId: "c1",
        accountPlanId: "a1",
        isPrimary: true,
        accountPlan: {
          id: "a1",
          code: "5.1.01.001",
          name: "Sueldos",
          type: "EXPENSE",
        },
        category: { id: "c1", name: "Sueldos", kind: "EXPENSE" },
      },
      {
        categoryId: "c2",
        accountPlanId: "a2",
        isPrimary: true,
        accountPlan: {
          id: "a2",
          code: "6.1.02.003",
          name: "Comunicaciones",
          type: "EXPENSE",
        },
        category: { id: "c2", name: "Telefonía", kind: "EXPENSE" },
      },
    ]);

    const report = await getFlowHealth(TENANT);

    expect(report.rowsWithoutCategory).toEqual([
      { id: "r1", name: "Retiro socios", section: "FINANCIAMIENTO" },
    ]);
    expect(report.categoriesWithoutRow.map((c) => c.code)).toEqual([
      "EGR_TELEFONIA",
    ]);
    expect(report.connectedRowCount).toBe(1);
  });

  it("detecta cuentas ambiguas y egresos en ASSET/LIABILITY", async () => {
    asMock(prisma.financeFlowRow.findMany).mockResolvedValue([]);
    asMock(prisma.financeCashflowCategory.findMany).mockResolvedValue([
      {
        id: "c1",
        code: "EGR_SUELDO",
        name: "Sueldos",
        kind: "EXPENSE",
        accountPlanId: null,
      },
      {
        id: "c2",
        code: "EGR_QUINCENA",
        name: "Quincena",
        kind: "EXPENSE",
        accountPlanId: null,
      },
    ]);
    asMock(prisma.financeCashflowCategoryAccount.findMany).mockResolvedValue([
      {
        categoryId: "c1",
        accountPlanId: "a1",
        isPrimary: true,
        accountPlan: {
          id: "a1",
          code: "5.1.01.001",
          name: "Sueldos",
          type: "EXPENSE",
        },
        category: { id: "c1", name: "Sueldos", kind: "EXPENSE" },
      },
      {
        categoryId: "c2",
        accountPlanId: "a1",
        isPrimary: true,
        accountPlan: {
          id: "a1",
          code: "5.1.01.001",
          name: "Sueldos",
          type: "EXPENSE",
        },
        category: { id: "c2", name: "Quincena", kind: "EXPENSE" },
      },
      {
        categoryId: "c1",
        accountPlanId: "a2",
        isPrimary: false,
        accountPlan: {
          id: "a2",
          code: "1.2.02.001",
          name: "Sistemas",
          type: "ASSET",
        },
        category: { id: "c1", name: "Sueldos", kind: "EXPENSE" },
      },
    ]);

    const report = await getFlowHealth(TENANT);

    expect(report.ambiguousAccounts).toHaveLength(1);
    expect(report.ambiguousAccounts[0].categories).toHaveLength(2);
    expect(report.expenseCategoriesOnNonExpenseAccounts).toEqual([
      expect.objectContaining({
        accountCode: "1.2.02.001",
        accountType: "ASSET",
      }),
    ]);
  });
});

describe("getFlowDestinationChain", () => {
  it("advierte fila sin categoría", async () => {
    asMock(prisma.financeFlowRow.findFirst).mockResolvedValue({
      id: "r1",
      name: "Aporte socios",
      section: "FINANCIAMIENTO",
      mapping: "MANUAL",
      categoryId: null,
    });

    const chain = await getFlowDestinationChain(TENANT, { flowRowId: "r1" });
    expect(chain.row?.name).toBe("Aporte socios");
    expect(chain.warnings).toContain("la fila no puede recibir movimientos");
  });

  it("advierte cuenta sin fila de flujo", async () => {
    asMock(prisma.financeAccountPlan.findFirst).mockResolvedValue({
      id: "a1",
      code: "6.1.02.003",
      name: "Comunicaciones",
      type: "EXPENSE",
    });
    asMock(prisma.financeCashflowCategoryAccount.findFirst).mockResolvedValue({
      category: {
        id: "c1",
        code: "EGR_TELEFONIA",
        name: "Telefonía",
        kind: "EXPENSE",
      },
    });
    asMock(prisma.financeFlowRow.findFirst).mockResolvedValue(null);

    const chain = await getFlowDestinationChain(TENANT, {
      accountPlanId: "a1",
    });
    expect(chain.category?.code).toBe("EGR_TELEFONIA");
    expect(chain.warnings[0]).toMatch(/Otros egresos/);
  });
});
