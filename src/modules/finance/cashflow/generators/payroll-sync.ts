import "server-only";
import { prisma } from "@/lib/prisma";
import { startOfMonth } from "date-fns";
import { computeEmployerCost } from "@/modules/payroll/engine/compute-employer-cost";

const PAYROLL_CATEGORY_CODE = "EGR_SUELDO";

type SyncAction = "created" | "updated" | "deactivated" | "reactivated" | "noop";

/**
 * Calcula el costo empleador mensual estimado para una instalación
 * sumando el costo de cada puesto operativo activo con salary structure.
 * Reusa la fórmula de payroll-from-dotacion.ts.
 */
async function computeMonthlyPayrollForInstallation(
  tenantId: string,
  installationId: string,
): Promise<{ amount: number; name: string | null } | null> {
  const puestos = await prisma.opsPuestoOperativo.findMany({
    where: {
      tenantId,
      installationId,
      active: true,
      salaryStructureId: { not: null },
    },
    select: {
      installation: { select: { name: true } },
      salaryStructure: { select: { baseSalary: true } },
    },
  });
  if (puestos.length === 0) return null;

  const useFullCompute = puestos.length <= 50;
  let total = 0;
  let name: string | null = null;
  for (const p of puestos) {
    if (!p.salaryStructure) continue;
    if (!name) name = p.installation?.name ?? null;
    const baseSalary = Number(p.salaryStructure.baseSalary ?? 0);
    if (baseSalary <= 0) continue;
    let employerCost = baseSalary * 1.45;
    if (useFullCompute) {
      try {
        const r = await computeEmployerCost({
          base_salary_clp: baseSalary,
          contract_type: "indefinite",
        });
        if (r?.monthly_employer_cost_clp) employerCost = r.monthly_employer_cost_clp;
      } catch {
        // fallback al factor
      }
    }
    total += employerCost;
  }
  if (total <= 0) return null;
  return { amount: total, name };
}

/**
 * Idempotente: garantiza que cada instalación con dotación activa tenga
 * un FinanceCashflowItem con source=PAYROLL, sourceRefId=installationId.
 */
export async function syncPayrollItemForInstallation(
  tenantId: string,
  installationId: string,
): Promise<{ action: SyncAction }> {
  const cat = await prisma.financeCashflowCategory.findFirst({
    where: { tenantId, code: PAYROLL_CATEGORY_CODE, isActive: true },
    select: { id: true },
  });
  if (!cat) return { action: "noop" };

  const config = await prisma.financeCashflowConfig.findUnique({
    where: { tenantId },
    select: { payrollPayDay: true },
  });
  const payDay = config?.payrollPayDay ?? 5;
  const dom = payDay === -1 ? -1 : Math.min(Math.max(payDay, 1), 28);

  const computed = await computeMonthlyPayrollForInstallation(tenantId, installationId);

  const existing = await prisma.financeCashflowItem.findFirst({
    where: { tenantId, source: "PAYROLL", sourceRefId: installationId },
  });

  if (!computed) {
    if (existing && existing.isActive) {
      await prisma.financeCashflowItem.update({
        where: { id: existing.id },
        data: { isActive: false },
      });
      return { action: "deactivated" };
    }
    return { action: "noop" };
  }

  const data = {
    tenantId,
    categoryId: cat.id,
    kind: "EXPENSE" as const,
    source: "PAYROLL" as const,
    sourceRefId: installationId,
    name: `Sueldos · ${computed.name ?? "instalación"}`,
    description: "Costo empleador mensual estimado (dotación activa)",
    amount: Math.round(computed.amount),
    currency: "CLP",
    recurrence: "MONTHLY" as const,
    dayOfMonth: dom,
    dayOfWeek: null,
    monthOfYear: null,
    startDate: startOfMonth(new Date()),
    endDate: null,
    installationId,
    isActive: true,
  };

  if (existing) {
    await prisma.financeCashflowItem.update({ where: { id: existing.id }, data });
    return { action: existing.isActive ? "updated" : "reactivated" };
  }
  await prisma.financeCashflowItem.create({ data });
  return { action: "created" };
}

export interface RecomputeStats {
  created: number;
  updated: number;
  reactivated: number;
  deactivated: number;
}

/** Recorre todas las instalaciones del tenant y refresca el item de payroll. */
export async function recomputePayrollAmounts(tenantId: string): Promise<RecomputeStats> {
  const installations = await prisma.crmInstallation.findMany({
    where: { tenantId },
    select: { id: true },
  });
  // También procesar instalaciones que ya tienen item PAYROLL pero ya no
  // tienen dotación (las "huérfanas") para desactivarlas.
  const orphans = await prisma.financeCashflowItem.findMany({
    where: { tenantId, source: "PAYROLL" },
    select: { sourceRefId: true },
  });
  const targets = new Set<string>();
  for (const i of installations) targets.add(i.id);
  for (const o of orphans) if (o.sourceRefId) targets.add(o.sourceRefId);

  const stats: RecomputeStats = { created: 0, updated: 0, reactivated: 0, deactivated: 0 };
  for (const id of targets) {
    const r = await syncPayrollItemForInstallation(tenantId, id);
    if (r.action === "created") stats.created++;
    else if (r.action === "updated") stats.updated++;
    else if (r.action === "reactivated") stats.reactivated++;
    else if (r.action === "deactivated") stats.deactivated++;
  }
  return stats;
}

export async function setPayrollItemsActive(
  tenantId: string,
  active: boolean,
): Promise<{ affected: number }> {
  const r = await prisma.financeCashflowItem.updateMany({
    where: { tenantId, source: "PAYROLL" },
    data: { isActive: active },
  });
  return { affected: r.count };
}
