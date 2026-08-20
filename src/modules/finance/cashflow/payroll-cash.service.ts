/**
 * Única fuente de verdad para la proyección de caja de remuneraciones.
 *
 * Previred = cotizaciones trabajador (AFP + Salud + AFC)
 *          + aportes empleador (SIS + Reforma + AFC patronal + Mutual)
 *
 * Sin residual, sin provisiones de vacaciones/indemnización, sin fallbacks
 * por volumen. Solo lectura (nunca escribe en BD).
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import { computeEmployerCost } from "@/modules/payroll/engine/compute-employer-cost";
import {
  loadActiveParameters,
  resolveFxReferences,
} from "@/modules/payroll/engine/parameter-loader";
import { resolveStructureAllowances } from "@/modules/payroll/resolve-structure-allowances";

const DEFAULT_AFP = "Modelo";
const VACATION_PCT = 0.0833;
const SEVERANCE_PCT = 0.04166;

export interface PayrollCashBreakdown {
  liquido: number;
  previred: number;
  impuestoUnico: number;
  provisiones: number;
  costoDirecto: number;
  cotizacionesTrabajador: number;
  aportesEmpleador: number;
  dotacion: number;
  /** Puestos omitidos por error de cálculo (no tumba el matrix). */
  excludedPuestos: number;
  /** Puestos donde se usó el líquido del motor (netSalaryEstimate null). */
  liquidoFromMotor: number;
}

export type PayrollCashInstallation = PayrollCashBreakdown & {
  name: string | null;
};

type SalaryStructureRow = {
  id: string;
  baseSalary: unknown;
  colacion: unknown;
  movilizacion: unknown;
  gratificationType: string;
  gratificationCustomAmount: unknown;
  netSalaryEstimate: unknown;
  bonos: Array<{
    overrideAmount: unknown;
    overridePercentage: unknown;
    bonoCatalog: {
      bonoType: string;
      isTaxable: boolean;
      defaultAmount: unknown;
      defaultPercentage: unknown;
    } | null;
  }>;
};

type PuestoRow = {
  id: string;
  installationId: string;
  requiredGuards: number | null;
  installation: { id: string; name: string | null } | null;
  salaryStructure: SalaryStructureRow | null;
};

type TenantPayrollConfig = {
  afpName: string;
  mutualRatePct: number | null;
};

type MemoEntry = {
  liquido: number;
  previred: number;
  impuestoUnico: number;
  provisiones: number;
  cotizacionesTrabajador: number;
  aportesEmpleador: number;
  liquidoFromMotor: boolean;
};

function emptyBreakdown(): PayrollCashBreakdown {
  return {
    liquido: 0,
    previred: 0,
    impuestoUnico: 0,
    provisiones: 0,
    costoDirecto: 0,
    cotizacionesTrabajador: 0,
    aportesEmpleador: 0,
    dotacion: 0,
    excludedPuestos: 0,
    liquidoFromMotor: 0,
  };
}

function roundBreakdown(b: PayrollCashBreakdown): PayrollCashBreakdown {
  const liquido = Math.round(b.liquido);
  const previred = Math.round(b.previred);
  const impuestoUnico = Math.round(b.impuestoUnico);
  const provisiones = Math.round(b.provisiones);
  const cotizacionesTrabajador = Math.round(b.cotizacionesTrabajador);
  const aportesEmpleador = Math.round(b.aportesEmpleador);
  return {
    liquido,
    previred,
    impuestoUnico,
    provisiones,
    costoDirecto: liquido + previred + impuestoUnico,
    cotizacionesTrabajador,
    aportesEmpleador,
    dotacion: b.dotacion,
    excludedPuestos: b.excludedPuestos,
    liquidoFromMotor: b.liquidoFromMotor,
  };
}

async function loadTenantPayrollConfig(tenantId: string): Promise<TenantPayrollConfig> {
  const config = await prisma.financeCashflowConfig.findUnique({
    where: { tenantId },
    select: {
      payrollAfpName: true,
      payrollMutualRatePct: true,
    },
  });
  const afpName = (config?.payrollAfpName?.trim() || DEFAULT_AFP);
  const mutualRaw = config?.payrollMutualRatePct;
  const mutualRatePct =
    mutualRaw === null || mutualRaw === undefined ? null : Number(mutualRaw);
  return {
    afpName,
    mutualRatePct:
      mutualRatePct !== null && Number.isFinite(mutualRatePct) ? mutualRatePct : null,
  };
}

function puestoSelect() {
  return {
    id: true,
    installationId: true,
    requiredGuards: true,
    installation: { select: { id: true, name: true } },
    salaryStructure: {
      select: {
        id: true,
        baseSalary: true,
        colacion: true,
        movilizacion: true,
        gratificationType: true,
        gratificationCustomAmount: true,
        netSalaryEstimate: true,
        bonos: {
          where: { isActive: true },
          select: {
            overrideAmount: true,
            overridePercentage: true,
            bonoCatalog: {
              select: {
                bonoType: true,
                isTaxable: true,
                defaultAmount: true,
                defaultPercentage: true,
              },
            },
          },
        },
      },
    },
  } as const;
}

async function computeMemoForStructure(
  ss: SalaryStructureRow,
  opts: {
    paramsVersionId: string;
    ufValue: number;
    ufDate: string;
    utmValue: number;
    utmMonth: string;
    afpName: string;
    mutualRatePct: number | null;
  },
): Promise<MemoEntry> {
  const baseSalary = Number(ss.baseSalary ?? 0);
  const colacion = Number(ss.colacion ?? 0);
  const movilizacion = Number(ss.movilizacion ?? 0);
  const { bonosImponibles, bonosNoImponibles } = resolveStructureAllowances(
    baseSalary,
    ss.bonos.map((b) => ({
      overrideAmount: b.overrideAmount as number | string | null,
      overridePercentage: b.overridePercentage as number | string | null,
      bonoCatalog: b.bonoCatalog
        ? {
            bonoType: b.bonoCatalog.bonoType,
            isTaxable: b.bonoCatalog.isTaxable,
            defaultAmount: b.bonoCatalog.defaultAmount as number | string | null,
            defaultPercentage: b.bonoCatalog.defaultPercentage as
              | number
              | string
              | null,
          }
        : null,
    })),
  );

  let gratification_clp: number | undefined;
  if (ss.gratificationType === "CUSTOM") {
    const custom = Number(ss.gratificationCustomAmount ?? NaN);
    if (Number.isFinite(custom) && custom >= 0) {
      gratification_clp = custom;
    }
    // CUSTOM sin monto → cae a gratificación legal (no pasar override).
  }

  const assumptions: {
    include_vacation_provision: false;
    include_severance_provision: false;
    work_injury_override?: { total_rate: number };
  } = {
    include_vacation_provision: false,
    include_severance_provision: false,
  };
  if (opts.mutualRatePct !== null) {
    assumptions.work_injury_override = { total_rate: opts.mutualRatePct };
  }

  const result = await computeEmployerCost({
    base_salary_clp: baseSalary,
    contract_type: "indefinite",
    afp_name: opts.afpName,
    health_system: "fonasa",
    work_injury_risk: "security_industry",
    gratification_clp,
    other_taxable_allowances: bonosImponibles,
    meal_allowance: colacion,
    transport_allowance: movilizacion,
    other_non_taxable_allowances: bonosNoImponibles,
    params_version_id: opts.paramsVersionId,
    uf_value: opts.ufValue,
    uf_date: opts.ufDate,
    utm_value: opts.utmValue,
    utm_month: opts.utmMonth,
    assumptions,
  });

  const w = result.worker_breakdown_estimate;
  const b = result.breakdown;
  const cotizacionesTrabajador = w.afp.amount + w.health + w.afc;
  const aportesEmpleador =
    b.sis_employer +
    b.pension_reform_employer +
    b.afc_employer.total +
    b.work_injury_employer.amount;
  const previred = cotizacionesTrabajador + aportesEmpleador;
  const impuestoUnico = w.tax;
  const direct = b.subtotal_direct_cost;
  const provisiones = Math.round(direct * (VACATION_PCT + SEVERANCE_PCT));

  const persistedNet = Number(ss.netSalaryEstimate ?? 0);
  const liquidoFromMotor = !(persistedNet > 0);
  const liquido = liquidoFromMotor
    ? result.worker_net_salary_estimate
    : persistedNet;

  return {
    liquido,
    previred,
    impuestoUnico,
    provisiones,
    cotizacionesTrabajador,
    aportesEmpleador,
    liquidoFromMotor,
  };
}

async function accumulatePuestos(
  puestos: PuestoRow[],
  opts: {
    paramsVersionId: string;
    ufValue: number;
    ufDate: string;
    utmValue: number;
    utmMonth: string;
    afpName: string;
    mutualRatePct: number | null;
  },
): Promise<{
  total: PayrollCashBreakdown;
  byInstallation: Map<string, PayrollCashInstallation>;
  /** Expuesto para tests de memoización. */
  computeCalls: number;
}> {
  const memo = new Map<string, MemoEntry | "error">();
  const byInstallation = new Map<string, PayrollCashInstallation>();
  const total = emptyBreakdown();
  let computeCalls = 0;

  for (const p of puestos) {
    const ss = p.salaryStructure;
    if (!ss) continue;
    const baseSalary = Number(ss.baseSalary ?? 0);
    if (baseSalary <= 0) continue;

    const count = Math.max(1, p.requiredGuards ?? 1);
    const instId = p.installationId;
    const instName = p.installation?.name ?? null;

    let entry = memo.get(ss.id);
    if (entry === undefined) {
      try {
        computeCalls += 1;
        entry = await computeMemoForStructure(ss, opts);
        memo.set(ss.id, entry);
      } catch (err) {
        console.error(
          `[PAYROLL-CASH] Error calculando estructura puestoId=${p.id}:`,
          err instanceof Error ? err.message : err,
        );
        memo.set(ss.id, "error");
        total.excludedPuestos += 1;
        continue;
      }
    }
    if (entry === "error") {
      total.excludedPuestos += 1;
      continue;
    }

    const add = (b: PayrollCashBreakdown) => {
      b.liquido += entry.liquido * count;
      b.previred += entry.previred * count;
      b.impuestoUnico += entry.impuestoUnico * count;
      b.provisiones += entry.provisiones * count;
      b.cotizacionesTrabajador += entry.cotizacionesTrabajador * count;
      b.aportesEmpleador += entry.aportesEmpleador * count;
      b.dotacion += count;
      if (entry.liquidoFromMotor) b.liquidoFromMotor += count;
    };

    add(total);
    let inst = byInstallation.get(instId);
    if (!inst) {
      inst = { ...emptyBreakdown(), name: instName };
      byInstallation.set(instId, inst);
    }
    if (!inst.name && instName) inst.name = instName;
    add(inst);
  }

  const roundedTotal = roundBreakdown(total);
  const roundedByInst = new Map<string, PayrollCashInstallation>();
  for (const [id, b] of byInstallation) {
    roundedByInst.set(id, { ...roundBreakdown(b), name: b.name });
  }
  return { total: roundedTotal, byInstallation: roundedByInst, computeCalls };
}

/**
 * Totales de caja de remuneraciones del tenant (solo instalaciones activas).
 */
export async function computePayrollCashForTenant(tenantId: string): Promise<{
  total: PayrollCashBreakdown;
  byInstallation: Map<string, PayrollCashInstallation>;
  /** Solo para tests / diagnóstico. */
  _meta?: { computeCalls: number };
}> {
  let paramsVersion: Awaited<ReturnType<typeof loadActiveParameters>>;
  let references: Awaited<ReturnType<typeof resolveFxReferences>>;
  try {
    paramsVersion = await loadActiveParameters();
    references = await resolveFxReferences(
      undefined,
      undefined,
      undefined,
      undefined,
      paramsVersion.data.imm?.value_clp,
    );
  } catch (err) {
    console.error(
      `[PAYROLL-CASH] Sin parámetros activos — omitiendo nómina tenant=${tenantId}:`,
      err instanceof Error ? err.message : err,
    );
    return { total: emptyBreakdown(), byInstallation: new Map() };
  }

  const tenantCfg = await loadTenantPayrollConfig(tenantId);

  const puestos = (await prisma.opsPuestoOperativo.findMany({
    where: {
      tenantId,
      active: true,
      salaryStructureId: { not: null },
      installation: {
        tenantId,
        status: "active",
        isActive: true,
      },
    },
    select: puestoSelect(),
  })) as unknown as PuestoRow[];

  const { total, byInstallation, computeCalls } = await accumulatePuestos(puestos, {
    paramsVersionId: paramsVersion.id,
    ufValue: references.uf_clp,
    ufDate: references.uf_date,
    utmValue: references.utm_clp,
    utmMonth: references.utm_month,
    afpName: tenantCfg.afpName,
    mutualRatePct: tenantCfg.mutualRatePct,
  });

  return { total, byInstallation, _meta: { computeCalls } };
}

/**
 * Totales de una instalación. Valida pertenencia al tenant.
 * Retorna null si no hay puestos activos con estructura válida,
 * o si la instalación no está activa / no pertenece al tenant.
 */
export async function computePayrollCashForInstallation(
  tenantId: string,
  installationId: string,
): Promise<PayrollCashInstallation | null> {
  const installation = await prisma.crmInstallation.findFirst({
    where: {
      id: installationId,
      tenantId,
      status: "active",
      isActive: true,
    },
    select: { id: true, name: true },
  });
  if (!installation) return null;

  let paramsVersion: Awaited<ReturnType<typeof loadActiveParameters>>;
  let references: Awaited<ReturnType<typeof resolveFxReferences>>;
  try {
    paramsVersion = await loadActiveParameters();
    references = await resolveFxReferences(
      undefined,
      undefined,
      undefined,
      undefined,
      paramsVersion.data.imm?.value_clp,
    );
  } catch (err) {
    console.error(
      `[PAYROLL-CASH] Sin parámetros activos — omitiendo instalación=${installationId}:`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }

  const tenantCfg = await loadTenantPayrollConfig(tenantId);

  const puestos = (await prisma.opsPuestoOperativo.findMany({
    where: {
      tenantId,
      installationId,
      active: true,
      salaryStructureId: { not: null },
    },
    select: puestoSelect(),
  })) as unknown as PuestoRow[];

  if (puestos.length === 0) return null;

  const { byInstallation } = await accumulatePuestos(puestos, {
    paramsVersionId: paramsVersion.id,
    ufValue: references.uf_clp,
    ufDate: references.uf_date,
    utmValue: references.utm_clp,
    utmMonth: references.utm_month,
    afpName: tenantCfg.afpName,
    mutualRatePct: tenantCfg.mutualRatePct,
  });

  const result = byInstallation.get(installationId);
  if (!result || result.dotacion === 0) return null;
  return { ...result, name: result.name ?? installation.name };
}

/**
 * Totales de caja del equipo interno (personas ADMINISTRATIVO con sueldo).
 * No usa puestos ni instalaciones.
 */
export async function computeStaffPayrollCashForTenant(
  tenantId: string,
): Promise<PayrollCashBreakdown> {
  let paramsVersion: Awaited<ReturnType<typeof loadActiveParameters>>;
  let references: Awaited<ReturnType<typeof resolveFxReferences>>;
  try {
    paramsVersion = await loadActiveParameters();
    references = await resolveFxReferences(
      undefined,
      undefined,
      undefined,
      undefined,
      paramsVersion.data.imm?.value_clp,
    );
  } catch (err) {
    console.error(
      `[PAYROLL-CASH] Sin parámetros activos — omitiendo staff tenant=${tenantId}:`,
      err instanceof Error ? err.message : err,
    );
    return emptyBreakdown();
  }

  const tenantCfg = await loadTenantPayrollConfig(tenantId);
  const personas = await prisma.opsPersona.findMany({
    where: {
      tenantId,
      status: "active",
      laborClass: "ADMINISTRATIVO",
      salaryStructureId: { not: null },
      salaryStructure: { isActive: true },
    },
    select: {
      id: true,
      salaryStructure: {
        select: {
          id: true,
          baseSalary: true,
          colacion: true,
          movilizacion: true,
          gratificationType: true,
          gratificationCustomAmount: true,
          netSalaryEstimate: true,
          bonos: {
            where: { isActive: true },
            select: {
              overrideAmount: true,
              overridePercentage: true,
              bonoCatalog: {
                select: {
                  bonoType: true,
                  isTaxable: true,
                  defaultAmount: true,
                  defaultPercentage: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const memo = new Map<string, MemoEntry | "error">();
  const total = emptyBreakdown();
  const opts = {
    paramsVersionId: paramsVersion.id,
    ufValue: references.uf_clp,
    ufDate: references.uf_date,
    utmValue: references.utm_clp,
    utmMonth: references.utm_month,
    afpName: tenantCfg.afpName,
    mutualRatePct: tenantCfg.mutualRatePct,
  };

  for (const p of personas) {
    const ss = p.salaryStructure as SalaryStructureRow | null;
    if (!ss) continue;
    const baseSalary = Number(ss.baseSalary ?? 0);
    if (baseSalary <= 0) continue;

    let entry = memo.get(ss.id);
    if (entry === undefined) {
      try {
        entry = await computeMemoForStructure(ss, opts);
        memo.set(ss.id, entry);
      } catch (err) {
        console.error(
          `[PAYROLL-CASH] Error calculando sueldo staff personaId=${p.id}:`,
          err instanceof Error ? err.message : err,
        );
        memo.set(ss.id, "error");
        total.excludedPuestos += 1;
        continue;
      }
    }
    if (entry === "error") {
      total.excludedPuestos += 1;
      continue;
    }
    total.liquido += entry.liquido;
    total.previred += entry.previred;
    total.impuestoUnico += entry.impuestoUnico;
    total.provisiones += entry.provisiones;
    total.cotizacionesTrabajador += entry.cotizacionesTrabajador;
    total.aportesEmpleador += entry.aportesEmpleador;
    total.dotacion += 1;
    if (entry.liquidoFromMotor) total.liquidoFromMotor += 1;
  }

  return roundBreakdown(total);
}
