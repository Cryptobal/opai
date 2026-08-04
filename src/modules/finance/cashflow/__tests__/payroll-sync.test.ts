/**
 * Tests del payroll-sync con split PAYROLL_LIQUIDO + PAYROLL_PREVIRED.
 * Mockea Prisma + payroll-cash.service para validar upsert/deactivate.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/modules/finance/cashflow/payroll-cash.service", () => ({
  computePayrollCashForInstallation: vi.fn(),
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
import { computePayrollCashForInstallation } from "@/modules/finance/cashflow/payroll-cash.service";
import {
  syncPayrollItemForInstallation,
  recomputePayrollAmounts,
  setPayrollItemsActive,
  computeMonthlyPayrollForInstallation,
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
  (computePayrollCashForInstallation as ReturnType<typeof vi.fn>).mockResolvedValue({
    liquido: 1_162_000,
    previred: 450_000,
    impuestoUnico: 0,
    provisiones: 80_000,
    costoDirecto: 1_612_000,
    cotizacionesTrabajador: 300_000,
    aportesEmpleador: 150_000,
    dotacion: 2,
    excludedPuestos: 0,
    liquidoFromMotor: 0,
    name: "Edificio X",
  });
});

describe("computeMonthlyPayrollForInstallation", () => {
  it("delega en payroll-cash y amplía PayrollAmounts", async () => {
    const r = await computeMonthlyPayrollForInstallation(TENANT, INST);
    expect(r).toEqual({
      liquido: 1_162_000,
      previRed: 450_000,
      total: 1_612_000 + 80_000,
      name: "Edificio X",
      impuestoUnico: 0,
      provisiones: 80_000,
      costoDirecto: 1_612_000,
    });
  });
});

describe("syncPayrollItemForInstallation", () => {
  it("crea DOS items por instalación: PAYROLL_LIQUIDO + PAYROLL_PREVIRED", async () => {
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

    expect(liquido.amount).toBe(1_162_000);
    expect(liquido.dayOfMonth).toBe(28);
    expect(previred.amount).toBe(450_000);
    expect(previred.dayOfMonth).toBe(10);
  });

  it("desactiva variants si la instalación ya no tiene puestos con salaryStructure", async () => {
    (computePayrollCashForInstallation as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.financeCashflowItem.updateMany as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ count: 0 }) // legacy PAYROLL
      .mockResolvedValueOnce({ count: 2 }); // PAYROLL_LIQUIDO + PAYROLL_PREVIRED

    const r = await syncPayrollItemForInstallation(TENANT, INST);
    expect(r.action).toBe("deactivated");
  });

  it("desactiva item legacy source=PAYROLL al re-sincronizar", async () => {
    (prisma.financeCashflowItem.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.financeCashflowItem.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "x" });

    await syncPayrollItemForInstallation(TENANT, INST);

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
    (computePayrollCashForInstallation as ReturnType<typeof vi.fn>).mockImplementation(
      async (_t: string, id: string) => {
        if (id === "inst-orphan") return null;
        return {
          liquido: 100_000,
          previred: 40_000,
          impuestoUnico: 0,
          provisiones: 10_000,
          costoDirecto: 140_000,
          cotizacionesTrabajador: 25_000,
          aportesEmpleador: 15_000,
          dotacion: 1,
          excludedPuestos: 0,
          liquidoFromMotor: 0,
          name: id,
        };
      },
    );
    (prisma.financeCashflowItem.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.financeCashflowItem.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "x" });
    (prisma.financeCashflowItem.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({
      count: 0,
    });

    const stats = await recomputePayrollAmounts(TENANT);
    expect(computePayrollCashForInstallation).toHaveBeenCalledTimes(3);
    expect(stats.created + stats.updated + stats.deactivated).toBeGreaterThan(0);
  });
});

describe("setPayrollItemsActive", () => {
  it("togglea isActive de todos los items payroll del tenant", async () => {
    (prisma.financeCashflowItem.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({
      count: 4,
    });
    const r = await setPayrollItemsActive(TENANT, false);
    expect(r.affected).toBe(4);
  });
});
