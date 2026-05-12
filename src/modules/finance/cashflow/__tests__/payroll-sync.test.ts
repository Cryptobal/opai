/**
 * Tests del payroll-sync con split PAYROLL_LIQUIDO + PAYROLL_PREVIRED.
 * Mockea Prisma para validar la lógica de upsert/deactivate sin tocar DB.
 */
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
    financeCashflowCategory: { findMany: vi.fn() },
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
  (prisma.financeCashflowCategory.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
    { id: "cat-sueldo", code: "EGR_SUELDO" },
    { id: "cat-previred", code: "EGR_PREVIRED" },
  ]);
  (prisma.financeCashflowConfig.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
    payrollPayDay: 30,
    previRedPayDay: 10,
  });
  (prisma.financeCashflowItem.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({
    count: 0,
  });
});

describe("syncPayrollItemForInstallation", () => {
  it("crea DOS items por instalación: PAYROLL_LIQUIDO + PAYROLL_PREVIRED", async () => {
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

    const calls = (prisma.financeCashflowItem.create as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.length).toBe(2);
    const sources = calls.map((c) => c[0].data.source).sort();
    expect(sources).toEqual(["PAYROLL_LIQUIDO", "PAYROLL_PREVIRED"]);

    const liquido = calls.find((c) => c[0].data.source === "PAYROLL_LIQUIDO")![0].data;
    const previred = calls.find((c) => c[0].data.source === "PAYROLL_PREVIRED")![0].data;

    // 2 * 700_000 = 1.400.000 bruto. Líquido = bruto * 0.83 = 1.162.000.
    expect(liquido.amount).toBe(1_162_000);
    // payrollPayDay=30 se capa a 28 para que el día siempre exista.
    expect(liquido.dayOfMonth).toBe(28);

    // Costo empleador = 2 * 700_000 * 1.45 = 2.030.000.
    // PreviRed = empleador - liquido = 2.030.000 - 1.162.000 = 868.000.
    expect(previred.amount).toBe(868_000);
    expect(previred.dayOfMonth).toBe(10);
  });

  it("desactiva variants si la instalación ya no tiene puestos con salaryStructure", async () => {
    (prisma.opsPuestoOperativo.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.financeCashflowItem.updateMany as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ count: 0 }) // legacy PAYROLL
      .mockResolvedValueOnce({ count: 2 }); // PAYROLL_LIQUIDO + PAYROLL_PREVIRED

    const r = await syncPayrollItemForInstallation(TENANT, INST);
    expect(r.action).toBe("deactivated");
  });

  it("desactiva item legacy source=PAYROLL al re-sincronizar", async () => {
    (prisma.opsPuestoOperativo.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        installation: { name: "X" },
        salaryStructure: { baseSalary: 1_000_000 },
      },
    ]);
    (prisma.financeCashflowItem.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.financeCashflowItem.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "x" });

    await syncPayrollItemForInstallation(TENANT, INST);

    // updateMany debe haberse llamado para desactivar el legacy PAYROLL.
    const updateManyCalls = (prisma.financeCashflowItem.updateMany as ReturnType<typeof vi.fn>)
      .mock.calls;
    const deactivateCall = updateManyCalls.find(
      (c) => c[0].where.source === "PAYROLL",
    );
    expect(deactivateCall).toBeTruthy();
    expect(deactivateCall![0].data.isActive).toBe(false);
  });

  it("payrollPayDay = -1 → líquido cae el último día del mes", async () => {
    (prisma.financeCashflowConfig.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      payrollPayDay: -1,
      previRedPayDay: 10,
    });
    (prisma.opsPuestoOperativo.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { installation: { name: "X" }, salaryStructure: { baseSalary: 500_000 } },
    ]);
    (prisma.financeCashflowItem.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.financeCashflowItem.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "x" });

    await syncPayrollItemForInstallation(TENANT, INST);
    const calls = (prisma.financeCashflowItem.create as ReturnType<typeof vi.fn>).mock.calls;
    const liquido = calls.find((c) => c[0].data.source === "PAYROLL_LIQUIDO")![0].data;
    expect(liquido.dayOfMonth).toBe(-1);
  });

  it("cae a categoría EGR_SUELDO para PreviRed si no existe EGR_PREVIRED", async () => {
    (prisma.financeCashflowCategory.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "cat-sueldo", code: "EGR_SUELDO" },
    ]);
    (prisma.opsPuestoOperativo.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { installation: { name: "X" }, salaryStructure: { baseSalary: 500_000 } },
    ]);
    (prisma.financeCashflowItem.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.financeCashflowItem.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "x" });

    await syncPayrollItemForInstallation(TENANT, INST);
    const calls = (prisma.financeCashflowItem.create as ReturnType<typeof vi.fn>).mock.calls;
    const previred = calls.find((c) => c[0].data.source === "PAYROLL_PREVIRED")![0].data;
    expect(previred.categoryId).toBe("cat-sueldo");
  });
});

describe("recomputePayrollAmounts", () => {
  it("itera todas las instalaciones + huérfanas con items existentes", async () => {
    (prisma.crmInstallation.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "inst-A" },
      { id: "inst-B" },
    ]);
    (prisma.financeCashflowItem.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { sourceRefId: "inst-B" },
      { sourceRefId: "inst-orphan" },
    ]);
    (prisma.opsPuestoOperativo.findMany as ReturnType<typeof vi.fn>).mockImplementation(
      async ({ where }: { where: { installationId: string } }) => {
        if (where.installationId === "inst-orphan") return [];
        return [{ installation: { name: "X" }, salaryStructure: { baseSalary: 500_000 } }];
      },
    );
    (prisma.financeCashflowItem.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.financeCashflowItem.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "x" });
    // updateMany: legacy=0; para inst-orphan el segundo call (variants) > 0
    // para que retorne action=deactivated.
    let callIdx = 0;
    (prisma.financeCashflowItem.updateMany as ReturnType<typeof vi.fn>).mockImplementation(
      async ({ where }: { where: { source: { in?: string[] } | string } }) => {
        callIdx++;
        // El call que desactiva variants para inst-orphan tiene source=array
        const isVariantDeactivate =
          typeof where.source === "object" &&
          (where.source.in?.length ?? 0) === 2;
        return { count: isVariantDeactivate ? 2 : 0 };
      },
    );

    const stats = await recomputePayrollAmounts(TENANT);
    expect(stats.created).toBe(2);
    expect(stats.deactivated).toBe(1);
    expect(callIdx).toBeGreaterThan(0);
  });
});

describe("setPayrollItemsActive", () => {
  it("desactiva las tres variantes (legacy + líquido + previred)", async () => {
    const fn = prisma.financeCashflowItem.updateMany as ReturnType<typeof vi.fn>;
    fn.mockReset();
    fn.mockResolvedValue({ count: 7 });
    const r = await setPayrollItemsActive(TENANT, false);
    expect(r.affected).toBe(7);
    const call = fn.mock.calls[0][0];
    expect(call.where.source).toEqual({
      in: ["PAYROLL", "PAYROLL_LIQUIDO", "PAYROLL_PREVIRED"],
    });
    expect(call.data.isActive).toBe(false);
  });
});
