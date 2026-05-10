import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/modules/payroll/engine/compute-employer-cost", () => ({
  computeEmployerCost: vi.fn(async ({ base_salary_clp }) => ({
    monthly_employer_cost_clp: Math.round(base_salary_clp * 1.45),
  })),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    opsPuestoOperativo: { findMany: vi.fn() },
    crmInstallation: { findMany: vi.fn() },
    financeCashflowCategory: { findFirst: vi.fn() },
    financeCashflowConfig: { findUnique: vi.fn() },
    financeCashflowItem: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  syncPayrollItemForInstallation,
  recomputePayrollAmounts,
  setPayrollItemsActive,
} from "../generators/payroll-sync";

const TENANT = "tenant-1";
const INST = "inst-1";

beforeEach(() => {
  vi.clearAllMocks();
  (prisma.financeCashflowCategory.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
    id: "cat-payroll",
  });
  (prisma.financeCashflowConfig.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
    payrollPayDay: 5,
  });
});

describe("syncPayrollItemForInstallation", () => {
  it("crea un item con suma del costo empleador de los puestos activos", async () => {
    (prisma.opsPuestoOperativo.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        installation: { name: "Edificio X" },
        salaryStructure: { baseSalary: 700_000 },
      },
      {
        installation: { name: "Edificio X" },
        salaryStructure: { baseSalary: 700_000 },
      },
    ]);
    (prisma.financeCashflowItem.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.financeCashflowItem.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "x" });

    const r = await syncPayrollItemForInstallation(TENANT, INST);
    expect(r.action).toBe("created");
    const call = (prisma.financeCashflowItem.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.data.source).toBe("PAYROLL");
    expect(call.data.sourceRefId).toBe(INST);
    expect(call.data.amount).toBe(2_030_000); // 2 * 700_000 * 1.45
    expect(call.data.recurrence).toBe("MONTHLY");
    expect(call.data.dayOfMonth).toBe(5);
    expect(call.data.installationId).toBe(INST);
  });

  it("desactiva si la instalación ya no tiene puestos con salaryStructure", async () => {
    (prisma.opsPuestoOperativo.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.financeCashflowItem.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "item-1",
      isActive: true,
    });
    (prisma.financeCashflowItem.update as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "x" });

    const r = await syncPayrollItemForInstallation(TENANT, INST);
    expect(r.action).toBe("deactivated");
  });

  it("actualiza monto cuando cambia la dotación", async () => {
    (prisma.opsPuestoOperativo.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        installation: { name: "X" },
        salaryStructure: { baseSalary: 1_000_000 },
      },
    ]);
    (prisma.financeCashflowItem.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "item-1",
      isActive: true,
    });
    (prisma.financeCashflowItem.update as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "x" });

    const r = await syncPayrollItemForInstallation(TENANT, INST);
    expect(r.action).toBe("updated");
    const call = (prisma.financeCashflowItem.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.data.amount).toBe(1_450_000);
  });

  it("payrollPayDay = -1 → dayOfMonth = -1", async () => {
    (prisma.financeCashflowConfig.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      payrollPayDay: -1,
    });
    (prisma.opsPuestoOperativo.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { installation: { name: "X" }, salaryStructure: { baseSalary: 500_000 } },
    ]);
    (prisma.financeCashflowItem.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.financeCashflowItem.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "x" });

    await syncPayrollItemForInstallation(TENANT, INST);
    const call = (prisma.financeCashflowItem.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.data.dayOfMonth).toBe(-1);
  });
});

describe("recomputePayrollAmounts", () => {
  it("itera todas las instalaciones del tenant + huérfanas con item PAYROLL existente", async () => {
    (prisma.crmInstallation.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "inst-A" },
      { id: "inst-B" },
    ]);
    (prisma.financeCashflowItem.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { sourceRefId: "inst-B" }, // ya cubierta
      { sourceRefId: "inst-orphan" }, // huérfana → se desactivará
    ]);
    (prisma.opsPuestoOperativo.findMany as ReturnType<typeof vi.fn>).mockImplementation(
      async ({ where }: any) => {
        if (where.installationId === "inst-orphan") return [];
        return [{ installation: { name: "X" }, salaryStructure: { baseSalary: 500_000 } }];
      },
    );
    (prisma.financeCashflowItem.findFirst as ReturnType<typeof vi.fn>).mockImplementation(
      async ({ where }: any) => {
        if (where.sourceRefId === "inst-orphan") return { id: "ix", isActive: true };
        return null;
      },
    );
    (prisma.financeCashflowItem.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "x" });
    (prisma.financeCashflowItem.update as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "x" });

    const stats = await recomputePayrollAmounts(TENANT);
    expect(stats.created).toBe(2);
    expect(stats.deactivated).toBe(1);
  });
});

describe("setPayrollItemsActive", () => {
  it("filtra por tenant y source=PAYROLL", async () => {
    (prisma.financeCashflowItem.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({
      count: 7,
    });
    const r = await setPayrollItemsActive(TENANT, false);
    expect(r.affected).toBe(7);
    const call = (prisma.financeCashflowItem.updateMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.where.source).toBe("PAYROLL");
    expect(call.data.isActive).toBe(false);
  });
});
