import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    financeFlowRow: { findMany: vi.fn(), findFirst: vi.fn() },
    financeFlowRowAccount: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn() },
    financeCashflowCategory: { findMany: vi.fn(), findFirst: vi.fn() },
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
  it("lista renglones sin cuentas (excepto bandejas e ingresos)", async () => {
    asMock(prisma.financeFlowRow.findMany).mockResolvedValue([
      {
        id: "r1",
        name: "Retiro socios",
        section: "FINANCIAMIENTO",
        mapping: "MANUAL",
        canonicalKey: "RETIRO_SOCIO",
      },
      {
        id: "r2",
        name: "Otros egresos",
        section: "GAV",
        mapping: "MANUAL",
        canonicalKey: "BANDEJA_EGRESO",
      },
      {
        id: "r3",
        name: "Sueldos líquidos",
        section: "REMUNERACIONES",
        mapping: "ACCOUNTS",
        canonicalKey: "SUELDO",
      },
      {
        id: "r4",
        name: "Cliente A",
        section: "INGRESOS",
        mapping: "ACCOUNT_INSTALLATION",
        canonicalKey: null,
      },
    ]);
    asMock(prisma.financeFlowRowAccount.findMany).mockResolvedValue([
      {
        rowId: "r3",
        accountPlanId: "a1",
        isPrimary: true,
        isDefaultTarget: true,
        accountPlan: {
          id: "a1",
          code: "5.1.01.001",
          name: "Sueldos",
          type: "EXPENSE",
        },
        row: {
          id: "r3",
          name: "Sueldos líquidos",
          section: "REMUNERACIONES",
          canonicalKey: "SUELDO",
        },
      },
    ]);
    asMock(prisma.financeAccountPlan.findMany).mockResolvedValue([
      { id: "a1", code: "5.1.01.001", name: "Sueldos" },
      { id: "a2", code: "6.1.02.003", name: "Comunicaciones" },
    ]);

    const report = await getFlowHealth(TENANT);

    expect(report.rowsWithoutAccounts).toEqual([
      { id: "r1", name: "Retiro socios", section: "FINANCIAMIENTO" },
    ]);
    expect(report.accountsWithoutRow.map((a) => a.code)).toEqual([
      "6.1.02.003",
    ]);
    expect(report.connectedRowCount).toBeGreaterThanOrEqual(1);
  });

  it("detecta cuentas compartidas sin destino por defecto y ASSET/LIABILITY", async () => {
    asMock(prisma.financeFlowRow.findMany).mockResolvedValue([
      {
        id: "r1",
        name: "Sueldos",
        section: "REMUNERACIONES",
        mapping: "ACCOUNTS",
        canonicalKey: "SUELDO",
      },
      {
        id: "r2",
        name: "Quincena",
        section: "REMUNERACIONES",
        mapping: "ACCOUNTS",
        canonicalKey: "QUINCENA",
      },
    ]);
    asMock(prisma.financeFlowRowAccount.findMany).mockResolvedValue([
      {
        rowId: "r1",
        accountPlanId: "a1",
        isPrimary: true,
        isDefaultTarget: false,
        accountPlan: {
          id: "a1",
          code: "5.1.01.001",
          name: "Sueldos",
          type: "EXPENSE",
        },
        row: {
          id: "r1",
          name: "Sueldos",
          section: "REMUNERACIONES",
          canonicalKey: "SUELDO",
        },
      },
      {
        rowId: "r2",
        accountPlanId: "a1",
        isPrimary: true,
        isDefaultTarget: false,
        accountPlan: {
          id: "a1",
          code: "5.1.01.001",
          name: "Sueldos",
          type: "EXPENSE",
        },
        row: {
          id: "r2",
          name: "Quincena",
          section: "REMUNERACIONES",
          canonicalKey: "QUINCENA",
        },
      },
      {
        rowId: "r1",
        accountPlanId: "a2",
        isPrimary: false,
        isDefaultTarget: false,
        accountPlan: {
          id: "a2",
          code: "1.2.02.001",
          name: "Sistemas",
          type: "ASSET",
        },
        row: {
          id: "r1",
          name: "Sueldos",
          section: "REMUNERACIONES",
          canonicalKey: "SUELDO",
        },
      },
    ]);
    asMock(prisma.financeAccountPlan.findMany).mockResolvedValue([]);

    const report = await getFlowHealth(TENANT);

    expect(report.sharedAccountsWithoutDefault).toHaveLength(1);
    expect(report.sharedAccountsWithoutDefault[0].rows).toHaveLength(2);
    expect(report.expenseRowsOnNonExpenseAccounts).toEqual([
      expect.objectContaining({
        accountCode: "1.2.02.001",
        accountType: "ASSET",
      }),
    ]);
  });
});

describe("getFlowDestinationChain", () => {
  it("advierte renglón sin cuentas ni llave", async () => {
    asMock(prisma.financeFlowRow.findFirst).mockResolvedValue({
      id: "r1",
      name: "Aporte socios",
      section: "FINANCIAMIENTO",
      mapping: "MANUAL",
      categoryId: null,
      canonicalKey: null,
    });
    asMock(prisma.financeFlowRowAccount.findFirst).mockResolvedValue(null);

    const chain = await getFlowDestinationChain(TENANT, { flowRowId: "r1" });
    expect(chain.row?.id).toBe("r1");
    expect(chain.warnings.some((w) => /Otros egresos/i.test(w))).toBe(true);
  });
});
