/**
 * Tests del servicio de caja de remuneraciones (Previred explícito).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const computeEmployerCost = vi.fn();
vi.mock("@/modules/payroll/engine/compute-employer-cost", () => ({
  computeEmployerCost: (...args: unknown[]) => computeEmployerCost(...args),
}));

vi.mock("@/modules/payroll/engine/parameter-loader", () => ({
  loadActiveParameters: vi.fn(async () => ({
    id: "params-v1",
    data: { imm: { value_clp: 529_000 } },
    effectiveFrom: new Date("2026-08-01"),
    effectiveUntil: null,
  })),
  resolveFxReferences: vi.fn(async () => ({
    uf_clp: 39_000,
    uf_date: "2026-08-01",
    utm_clp: 68_000,
    utm_month: "2026-08",
    imm_clp: 529_000,
  })),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    financeCashflowConfig: { findUnique: vi.fn() },
    opsPuestoOperativo: { findMany: vi.fn() },
    crmInstallation: { findFirst: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  computePayrollCashForInstallation,
  computePayrollCashForTenant,
} from "../payroll-cash.service";

const TENANT = "tenant-gard";

function makeCostResult(opts: {
  liquido: number;
  afp: number;
  health: number;
  afc: number;
  tax: number;
  sis: number;
  reform: number;
  afcEmp: number;
  mutual: number;
  direct: number;
}) {
  return {
    monthly_employer_cost_clp: opts.direct,
    breakdown: {
      sis_employer: opts.sis,
      pension_reform_employer: opts.reform,
      afc_employer: { cic: 0, fcs: 0, total: opts.afcEmp },
      work_injury_employer: { base_rate: 0.0093, additional_rate: 0, total_rate: 0.012, amount: opts.mutual },
      subtotal_direct_cost: opts.direct,
      vacation_provision: 0,
      severance_provision: 0,
      total_cost: opts.direct,
    },
    worker_breakdown_estimate: {
      afp: { base_rate: 0.1, commission_rate: 0.0058, total_rate: 0.1058, amount: opts.afp },
      health: opts.health,
      afc: opts.afc,
      tax: opts.tax,
      total_deductions: opts.afp + opts.health + opts.afc + opts.tax,
    },
    worker_net_salary_estimate: opts.liquido,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  (prisma.financeCashflowConfig.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
    payrollAfpName: null,
    payrollMutualRatePct: null,
  });
  computeEmployerCost.mockImplementation(async (input: { base_salary_clp: number }) => {
    const base = input.base_salary_clp;
    // Números redondos para asserts: cotiz trab ~17%, aportes ~8%, sin impuesto.
    const afp = Math.floor(base * 0.1058);
    const health = Math.floor(base * 0.07);
    const afc = Math.floor(base * 0.006);
    const sis = Math.round(base * 0.0154);
    const reform = Math.round(base * 0.035);
    const afcEmp = Math.round(base * 0.024);
    const mutual = Math.round(base * 0.012);
    const meal = Number((input as { meal_allowance?: number }).meal_allowance ?? 0);
    const transport = Number((input as { transport_allowance?: number }).transport_allowance ?? 0);
    const otherTax = Number((input as { other_taxable_allowances?: number }).other_taxable_allowances ?? 0);
    const otherNon = Number((input as { other_non_taxable_allowances?: number }).other_non_taxable_allowances ?? 0);
    const grat =
      (input as { gratification_clp?: number }).gratification_clp !== undefined
        ? Number((input as { gratification_clp?: number }).gratification_clp)
        : Math.round(base * 0.25);
    const taxable = base + grat + otherTax;
    const nontax = meal + transport + otherNon;
    const employer = sis + reform + afcEmp + mutual;
    const worker = afp + health + afc;
    const tax = 0;
    const liquido = taxable + nontax - worker - tax;
    const direct = taxable + nontax + employer;
    return makeCostResult({
      liquido,
      afp,
      health,
      afc,
      tax,
      sis,
      reform,
      afcEmp,
      mutual,
      direct,
    });
  });
});

describe("computePayrollCashForTenant", () => {
  it("identidad: liquido + previred + impuestoUnico = costoDirecto; provisiones fuera", async () => {
    (prisma.opsPuestoOperativo.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: "p1",
        installationId: "inst-1",
        requiredGuards: 1,
        installation: { id: "inst-1", name: "Sitio A" },
        salaryStructure: {
          id: "ss-1",
          baseSalary: 600_000,
          colacion: 40_000,
          movilizacion: 35_000,
          gratificationType: "AUTO_25",
          gratificationCustomAmount: null,
          netSalaryEstimate: null,
          bonos: [],
        },
      },
    ]);

    const { total } = await computePayrollCashForTenant(TENANT);
    expect(total.liquido + total.previred + total.impuestoUnico).toBe(total.costoDirecto);
    expect(total.provisiones).toBeGreaterThan(0);
    // provisiones no están en previred ni liquido
    expect(total.previred).toBe(total.cotizacionesTrabajador + total.aportesEmpleador);
    expect(total.impuestoUnico).toBe(0);

    const call = computeEmployerCost.mock.calls[0][0];
    expect(call.meal_allowance).toBe(40_000);
    expect(call.transport_allowance).toBe(35_000);
    expect(call.assumptions.include_vacation_provision).toBe(false);
    expect(call.assumptions.include_severance_provision).toBe(false);
    expect(call.afp_name).toBe("Modelo");
    expect(call.work_injury_risk).toBe("security_industry");
  });

  it("gratificación CUSTOM entra al imponible", async () => {
    (prisma.opsPuestoOperativo.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: "p1",
        installationId: "inst-1",
        requiredGuards: 1,
        installation: { id: "inst-1", name: "A" },
        salaryStructure: {
          id: "ss-custom",
          baseSalary: 600_000,
          colacion: 0,
          movilizacion: 0,
          gratificationType: "CUSTOM",
          gratificationCustomAmount: 100_000,
          netSalaryEstimate: null,
          bonos: [],
        },
      },
    ]);

    await computePayrollCashForTenant(TENANT);
    expect(computeEmployerCost.mock.calls[0][0].gratification_clp).toBe(100_000);
  });

  it("clasifica bonos imponibles y no imponibles", async () => {
    (prisma.opsPuestoOperativo.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: "p1",
        installationId: "inst-1",
        requiredGuards: 1,
        installation: { id: "inst-1", name: "A" },
        salaryStructure: {
          id: "ss-bonos",
          baseSalary: 500_000,
          colacion: 0,
          movilizacion: 0,
          gratificationType: "AUTO_25",
          gratificationCustomAmount: null,
          netSalaryEstimate: null,
          bonos: [
            {
              overrideAmount: 50_000,
              overridePercentage: null,
              bonoCatalog: {
                bonoType: "FIJO",
                isTaxable: true,
                defaultAmount: 50_000,
                defaultPercentage: null,
              },
            },
            {
              overrideAmount: 20_000,
              overridePercentage: null,
              bonoCatalog: {
                bonoType: "FIJO",
                isTaxable: false,
                defaultAmount: 20_000,
                defaultPercentage: null,
              },
            },
          ],
        },
      },
    ]);

    await computePayrollCashForTenant(TENANT);
    const call = computeEmployerCost.mock.calls[0][0];
    expect(call.other_taxable_allowances).toBe(50_000);
    expect(call.other_non_taxable_allowances).toBe(20_000);
  });

  it("requiredGuards multiplica todos los componentes", async () => {
    (prisma.opsPuestoOperativo.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: "p1",
        installationId: "inst-1",
        requiredGuards: 3,
        installation: { id: "inst-1", name: "A" },
        salaryStructure: {
          id: "ss-1",
          baseSalary: 600_000,
          colacion: 0,
          movilizacion: 0,
          gratificationType: "AUTO_25",
          gratificationCustomAmount: null,
          netSalaryEstimate: null,
          bonos: [],
        },
      },
    ]);

    const { total } = await computePayrollCashForTenant(TENANT);
    expect(total.dotacion).toBe(3);
    // Una sola estructura → 1 call; montos × 3
    expect(computeEmployerCost).toHaveBeenCalledTimes(1);
    const perGuard = await computeEmployerCost.mock.results[0].value;
    const previredPer =
      perGuard.worker_breakdown_estimate.afp.amount +
      perGuard.worker_breakdown_estimate.health +
      perGuard.worker_breakdown_estimate.afc +
      perGuard.breakdown.sis_employer +
      perGuard.breakdown.pension_reform_employer +
      perGuard.breakdown.afc_employer.total +
      perGuard.breakdown.work_injury_employer.amount;
    expect(total.previred).toBe(Math.round(previredPer * 3));
  });

  it("memoiza por salaryStructureId (una sola llamada a computeEmployerCost)", async () => {
    (prisma.opsPuestoOperativo.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: "p1",
        installationId: "inst-1",
        requiredGuards: 1,
        installation: { id: "inst-1", name: "A" },
        salaryStructure: {
          id: "ss-shared",
          baseSalary: 600_000,
          colacion: 0,
          movilizacion: 0,
          gratificationType: "AUTO_25",
          gratificationCustomAmount: null,
          netSalaryEstimate: null,
          bonos: [],
        },
      },
      {
        id: "p2",
        installationId: "inst-2",
        requiredGuards: 2,
        installation: { id: "inst-2", name: "B" },
        salaryStructure: {
          id: "ss-shared",
          baseSalary: 600_000,
          colacion: 0,
          movilizacion: 0,
          gratificationType: "AUTO_25",
          gratificationCustomAmount: null,
          netSalaryEstimate: null,
          bonos: [],
        },
      },
    ]);

    const { total, _meta } = await computePayrollCashForTenant(TENANT);
    expect(computeEmployerCost).toHaveBeenCalledTimes(1);
    expect(_meta?.computeCalls).toBe(1);
    expect(total.dotacion).toBe(3);
  });
});

describe("computePayrollCashForInstallation", () => {
  it("retorna null si la instalación no está activa", async () => {
    (prisma.crmInstallation.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const r = await computePayrollCashForInstallation(TENANT, "inst-inactive");
    expect(r).toBeNull();
    expect(prisma.opsPuestoOperativo.findMany).not.toHaveBeenCalled();
  });

  it("calcula para instalación activa del tenant", async () => {
    (prisma.crmInstallation.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "inst-1",
      name: "Sitio A",
    });
    (prisma.opsPuestoOperativo.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: "p1",
        installationId: "inst-1",
        requiredGuards: 1,
        installation: { id: "inst-1", name: "Sitio A" },
        salaryStructure: {
          id: "ss-1",
          baseSalary: 600_000,
          colacion: 0,
          movilizacion: 0,
          gratificationType: "AUTO_25",
          gratificationCustomAmount: null,
          netSalaryEstimate: 720_000,
          bonos: [],
        },
      },
    ]);

    const r = await computePayrollCashForInstallation(TENANT, "inst-1");
    expect(r).not.toBeNull();
    expect(r!.liquido).toBe(720_000); // preferido persistido
    expect(r!.name).toBe("Sitio A");
    expect(r!.liquido + r!.previred + r!.impuestoUnico).toBe(r!.costoDirecto);
  });
});
