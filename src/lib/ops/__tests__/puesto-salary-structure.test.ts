import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  simulatePayslip: vi.fn(),
  resolveStructureAllowances: vi.fn(),
  ssCreate: vi.fn(),
  ssUpdate: vi.fn(),
  puestoUpdate: vi.fn(),
  bonoCreateMany: vi.fn(),
  bonoCatalogFindMany: vi.fn(),
}));

vi.mock("@/modules/payroll/engine/simulate-payslip", () => ({
  simulatePayslip: mocks.simulatePayslip,
}));

vi.mock("@/modules/payroll/resolve-structure-allowances", () => ({
  resolveStructureAllowances: mocks.resolveStructureAllowances,
}));

import { createPuestoSalaryStructure } from "../puesto-salary-structure";

const db = {
  payrollSalaryStructure: { create: mocks.ssCreate, update: mocks.ssUpdate },
  opsPuestoOperativo: { update: mocks.puestoUpdate },
  payrollSalaryStructureBono: { createMany: mocks.bonoCreateMany },
  payrollBonoCatalog: { findMany: mocks.bonoCatalogFindMany },
} as unknown as Parameters<typeof createPuestoSalaryStructure>[0];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ssCreate.mockResolvedValue({ id: "ss-1" });
  mocks.ssUpdate.mockResolvedValue({});
  mocks.puestoUpdate.mockResolvedValue({});
  mocks.bonoCreateMany.mockResolvedValue({ count: 0 });
  mocks.bonoCatalogFindMany.mockResolvedValue([]);
  mocks.resolveStructureAllowances.mockReturnValue({ bonosImponibles: 0, bonosNoImponibles: 0 });
  mocks.simulatePayslip.mockResolvedValue({ net_salary: 612_345 });
});

describe("createPuestoSalaryStructure", () => {
  it("crea la estructura PUESTO, la vincula y persiste el líquido informado sin simular", async () => {
    const effectiveFrom = new Date("2026-10-20T00:00:00.000Z");
    const r = await createPuestoSalaryStructure(db, {
      tenantId: "t1",
      puestoId: "p1",
      baseSalary: 600_000,
      effectiveFrom,
      netSalaryEstimate: 700_000,
      createdBy: "u1",
    });

    expect(r).toEqual({ salaryStructureId: "ss-1", netSalaryEstimate: 700_000 });
    expect(mocks.ssCreate.mock.calls[0][0].data).toMatchObject({
      tenantId: "t1",
      sourceType: "PUESTO",
      sourceId: "p1",
      baseSalary: 600_000,
      colacion: 0,
      movilizacion: 0,
      gratificationType: "AUTO_25",
      gratificationCustomAmount: null,
      isActive: true,
      effectiveFrom,
      createdBy: "u1",
    });
    expect(mocks.puestoUpdate).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { salaryStructureId: "ss-1" },
    });
    expect(mocks.ssUpdate).toHaveBeenCalledWith({
      where: { id: "ss-1" },
      data: { netSalaryEstimate: 700_000 },
    });
    expect(mocks.simulatePayslip).not.toHaveBeenCalled();
    expect(mocks.bonoCreateMany).not.toHaveBeenCalled();
  });

  it("sin líquido informado simula con colación/movilización/bonos y registra bonos", async () => {
    mocks.bonoCatalogFindMany.mockResolvedValue([
      { id: "b1", bonoType: "FIJO", isTaxable: true, defaultAmount: 50_000, defaultPercentage: null },
    ]);
    mocks.resolveStructureAllowances.mockReturnValue({ bonosImponibles: 50_000, bonosNoImponibles: 0 });

    const r = await createPuestoSalaryStructure(db, {
      tenantId: "t1",
      puestoId: "p2",
      baseSalary: 500_000,
      colacion: 40_000,
      movilizacion: 35_000,
      gratificationType: "CUSTOM",
      gratificationCustomAmount: 120_000,
      bonos: [{ bonoCatalogId: "b1", overrideAmount: 50_000 }, { bonoCatalogId: null }],
    });

    expect(r.netSalaryEstimate).toBe(612_345);
    expect(mocks.bonoCreateMany).toHaveBeenCalledTimes(1);
    expect(mocks.bonoCreateMany.mock.calls[0][0].data).toEqual([
      {
        salaryStructureId: "ss-1",
        bonoCatalogId: "b1",
        overrideAmount: 50_000,
        overridePercentage: null,
        isActive: true,
      },
    ]);
    expect(mocks.simulatePayslip).toHaveBeenCalledWith(
      expect.objectContaining({
        base_salary_clp: 500_000,
        gratification_clp: 120_000,
        other_taxable_allowances: 50_000,
        non_taxable_allowances: { transport: 35_000, meal: 40_000, other: 0 },
        save_simulation: false,
      }),
    );
    expect(mocks.ssUpdate).toHaveBeenCalledWith({
      where: { id: "ss-1" },
      data: { netSalaryEstimate: 612_345 },
    });
  });

  it("si la simulación falla la estructura queda creada sin líquido", async () => {
    mocks.simulatePayslip.mockRejectedValue(new Error("sin parámetros"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const r = await createPuestoSalaryStructure(db, {
      tenantId: "t1",
      puestoId: "p3",
      baseSalary: 450_000,
    });

    expect(r).toEqual({ salaryStructureId: "ss-1", netSalaryEstimate: null });
    expect(mocks.ssUpdate).not.toHaveBeenCalled();
    expect(mocks.puestoUpdate).toHaveBeenCalledTimes(1);
    errSpy.mockRestore();
  });
});
