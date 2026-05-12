import "server-only";
import { prisma } from "@/lib/prisma";
import { startOfMonth } from "date-fns";
import { computeEmployerCost } from "@/modules/payroll/engine/compute-employer-cost";

const PAYROLL_CATEGORY_CODE = "EGR_SUELDO";
const PREVIRED_CATEGORY_CODE = "EGR_PREVIRED";

type SyncAction = "created" | "updated" | "deactivated" | "reactivated" | "noop";

/**
 * Fallback de descuentos al trabajador cuando el puesto no tiene
 * `netSalaryEstimate` calculado: AFP 10–12% + Salud 7% + AFC trab 0.6% ≈ 17.6%.
 * Usamos 17% (subestima imposiciones, sobreestima líquido).
 */
const WORKER_DEDUCTION_FALLBACK = 0.17;

interface PayrollAmounts {
  /** Líquido total mensual a guardias (lo que se transfiere fin de mes). */
  liquido: number;
  /** Pago a PreviRed (imposiciones trab + aportes empleador). */
  previRed: number;
  /** Costo empleador total (línea legacy). */
  total: number;
  name: string | null;
}

async function computeMonthlyPayrollForInstallation(
  tenantId: string,
  installationId: string,
): Promise<PayrollAmounts | null> {
  // Cada `OpsPuestoOperativo` representa un puesto de trabajo con N guardias
  // requeridos (`requiredGuards`). El sueldo y el costo son POR guardia; hay
  // que multiplicar por la dotación para obtener el costo real del puesto.
  const puestos = await prisma.opsPuestoOperativo.findMany({
    where: {
      tenantId,
      installationId,
      active: true,
      salaryStructureId: { not: null },
    },
    select: {
      requiredGuards: true,
      installation: { select: { name: true } },
      salaryStructure: {
        select: { baseSalary: true, netSalaryEstimate: true },
      },
    },
  });
  if (puestos.length === 0) return null;

  const useFullCompute = puestos.length <= 50;
  let liquidoTotal = 0;
  let employerTotal = 0;
  let name: string | null = null;
  for (const p of puestos) {
    if (!p.salaryStructure) continue;
    if (!name) name = p.installation?.name ?? null;
    const baseSalary = Number(p.salaryStructure.baseSalary ?? 0);
    if (baseSalary <= 0) continue;

    const count = Math.max(1, p.requiredGuards ?? 1);

    // Líquido por guardia: preferimos `netSalaryEstimate` (incluye gratifica-
    // ción, colación, movilización y bonos). Si no existe, fallback al factor
    // 0.83 × base.
    const netPerGuard = Number(p.salaryStructure.netSalaryEstimate ?? 0);
    const liquidoPerGuard =
      netPerGuard > 0 ? netPerGuard : baseSalary * (1 - WORKER_DEDUCTION_FALLBACK);

    // Costo empleador por guardia: payroll engine (real, con AFP/Salud/SIS/
    // mutual/AFC patronal/grat) o fallback 1.45 × base.
    let employerCostPerGuard = baseSalary * 1.45;
    if (useFullCompute) {
      try {
        const r = await computeEmployerCost({
          base_salary_clp: baseSalary,
          contract_type: "indefinite",
        });
        if (r?.monthly_employer_cost_clp) {
          employerCostPerGuard = r.monthly_employer_cost_clp;
        }
      } catch {
        // fallback al factor
      }
    }

    liquidoTotal += liquidoPerGuard * count;
    employerTotal += employerCostPerGuard * count;
  }
  if (employerTotal <= 0) return null;

  const liquido = Math.round(liquidoTotal);
  const previRed = Math.max(0, Math.round(employerTotal - liquido));
  return { liquido, previRed, total: Math.round(employerTotal), name };
}

/** Crea/actualiza un FinanceCashflowItem para una variante específica. */
async function upsertPayrollVariant(args: {
  tenantId: string;
  installationId: string;
  source: "PAYROLL_LIQUIDO" | "PAYROLL_PREVIRED";
  categoryId: string;
  name: string;
  description: string;
  amount: number;
  dayOfMonth: number;
}): Promise<SyncAction> {
  const existing = await prisma.financeCashflowItem.findFirst({
    where: {
      tenantId: args.tenantId,
      source: args.source,
      sourceRefId: args.installationId,
    },
  });
  const data = {
    tenantId: args.tenantId,
    categoryId: args.categoryId,
    kind: "EXPENSE" as const,
    source: args.source,
    sourceRefId: args.installationId,
    name: args.name,
    description: args.description,
    amount: args.amount,
    currency: "CLP",
    recurrence: "MONTHLY" as const,
    dayOfMonth: args.dayOfMonth,
    dayOfWeek: null,
    monthOfYear: null,
    startDate: startOfMonth(new Date()),
    endDate: null,
    installationId: args.installationId,
    isActive: true,
  };
  if (existing) {
    await prisma.financeCashflowItem.update({ where: { id: existing.id }, data });
    return existing.isActive ? "updated" : "reactivated";
  }
  await prisma.financeCashflowItem.create({ data });
  return "created";
}

/**
 * Idempotente: garantiza que cada instalación con dotación activa tenga
 * DOS items en el cashflow:
 *   - PAYROLL_LIQUIDO: el monto que se transfiere al guardia (día payrollPayDay)
 *   - PAYROLL_PREVIRED: el pago a PreviRed (día previRedPayDay del mes siguiente)
 *
 * Si existía un item legacy source=PAYROLL (monolítico), se desactiva al
 * recomputar.
 */
export async function syncPayrollItemForInstallation(
  tenantId: string,
  installationId: string,
): Promise<{ action: SyncAction }> {
  const cats = await prisma.financeCashflowCategory.findMany({
    where: {
      tenantId,
      code: { in: [PAYROLL_CATEGORY_CODE, PREVIRED_CATEGORY_CODE] },
      isActive: true,
    },
    select: { id: true, code: true },
  });
  const sueldoCat = cats.find((c) => c.code === PAYROLL_CATEGORY_CODE);
  // PreviRed cae al mismo bucket conceptual que sueldos si no hay categoría
  // dedicada. Preferimos la específica cuando exista.
  const previRedCat = cats.find((c) => c.code === PREVIRED_CATEGORY_CODE) ?? sueldoCat;
  if (!sueldoCat || !previRedCat) return { action: "noop" };

  const config = await prisma.financeCashflowConfig.findUnique({
    where: { tenantId },
    select: {
      payrollPayDay: true,
      previRedPayDay: true,
      turnosExtraLiquidoDiscountPct: true,
      turnosExtraPreviRedDiscountPct: true,
    },
  });
  const payDay = config?.payrollPayDay ?? 30;
  const dom = payDay === -1 ? -1 : Math.min(Math.max(payDay, 1), 28);
  const previRedDay = config?.previRedPayDay ?? 10;
  const previRedDom =
    previRedDay === -1 ? -1 : Math.min(Math.max(previRedDay, 1), 28);
  const liquidoDiscountPct = Number(config?.turnosExtraLiquidoDiscountPct ?? 1);
  const previRedDiscountPct = Number(config?.turnosExtraPreviRedDiscountPct ?? 0);

  const computed = await computeMonthlyPayrollForInstallation(tenantId, installationId);

  // Desactivar items legacy PAYROLL (versión monolítica anterior) — quedaron
  // en BD antes del split de 2026-05. Solo desactiva, no borra, para no
  // perder occurrences PAID conciliadas con banco.
  await prisma.financeCashflowItem.updateMany({
    where: {
      tenantId,
      source: "PAYROLL",
      sourceRefId: installationId,
      isActive: true,
    },
    data: { isActive: false },
  });

  if (!computed) {
    // Sin dotación: desactivar variants vivas si las hay.
    const r = await prisma.financeCashflowItem.updateMany({
      where: {
        tenantId,
        source: { in: ["PAYROLL_LIQUIDO", "PAYROLL_PREVIRED"] },
        sourceRefId: installationId,
        isActive: true,
      },
      data: { isActive: false },
    });
    return { action: r.count > 0 ? "deactivated" : "noop" };
  }

  // Descuento de turnos extra: el ítem TE de esta instalación ya fue pagado
  // semanalmente, por lo que se descuenta del pago mensual según config.
  let teAmount = 0;
  if (liquidoDiscountPct > 0 || previRedDiscountPct > 0) {
    const teItem = await prisma.financeCashflowItem.findFirst({
      where: { tenantId, source: "TURNOS_EXTRA", sourceRefId: installationId, isActive: true },
      select: { amount: true },
    });
    teAmount = Number(teItem?.amount ?? 0);
  }

  const liquidoDescuento = Math.round(teAmount * liquidoDiscountPct);
  const previRedDescuento = Math.round(teAmount * previRedDiscountPct);
  const liquidoFinal = Math.max(0, computed.liquido - liquidoDescuento);
  const previRedFinal = Math.max(0, computed.previRed - previRedDescuento);

  const liquidoDesc =
    liquidoDescuento > 0
      ? `Líquido al guardia · descuenta $${liquidoDescuento.toLocaleString("es-CL")} de TE`
      : "Líquido al guardia (transferencia mensual)";
  const previRedDesc =
    previRedDescuento > 0
      ? `Imposiciones (AFP + Salud + AFC + SIS + mutual) · descuenta $${previRedDescuento.toLocaleString("es-CL")} de TE`
      : "Imposiciones (AFP + Salud + AFC + SIS + mutual)";

  const baseName = computed.name ?? "instalación";
  const a = await upsertPayrollVariant({
    tenantId,
    installationId,
    source: "PAYROLL_LIQUIDO",
    categoryId: sueldoCat.id,
    name: `Sueldos líquidos · ${baseName}`,
    description: liquidoDesc,
    amount: liquidoFinal,
    dayOfMonth: dom,
  });
  const b = await upsertPayrollVariant({
    tenantId,
    installationId,
    source: "PAYROLL_PREVIRED",
    categoryId: previRedCat.id,
    name: `PreviRed · ${baseName}`,
    description: previRedDesc,
    amount: previRedFinal,
    dayOfMonth: previRedDom,
  });
  // Reportamos el "peor caso" (en orden de novedad): created > reactivated > updated > noop.
  const order = { created: 4, reactivated: 3, updated: 2, deactivated: 1, noop: 0 } as const;
  return { action: order[a] >= order[b] ? a : b };
}

export interface RecomputeStats {
  created: number;
  updated: number;
  reactivated: number;
  deactivated: number;
}

/** Recorre todas las instalaciones del tenant y refresca payroll. */
export async function recomputePayrollAmounts(tenantId: string): Promise<RecomputeStats> {
  const installations = await prisma.crmInstallation.findMany({
    where: { tenantId },
    select: { id: true },
  });
  const orphans = await prisma.financeCashflowItem.findMany({
    where: {
      tenantId,
      source: { in: ["PAYROLL", "PAYROLL_LIQUIDO", "PAYROLL_PREVIRED"] },
    },
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
    where: {
      tenantId,
      source: { in: ["PAYROLL", "PAYROLL_LIQUIDO", "PAYROLL_PREVIRED"] },
    },
    data: { isActive: active },
  });
  return { affected: r.count };
}
