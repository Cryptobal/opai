import "server-only";
import { prisma } from "@/lib/prisma";
import { startOfMonth, subWeeks } from "date-fns";

const TE_CATEGORY_CODE = "EGR_TURNO_EXTRA";

type SyncAction = "created" | "updated" | "deactivated" | "reactivated" | "noop";

interface ComputedTurnosExtra {
  amount: number;
  name: string | null;
  /** Etiqueta para la descripción del item según el modo. */
  detail: string;
}

/**
 * Modo HISTORICAL: promedio SEMANAL rolling 8 semanas de OpsTurnoExtra.amountClp.
 * El ítem se proyecta semanalmente, por lo que el amount es el egreso por semana.
 */
async function computeHistorical(
  tenantId: string,
  installationId: string,
): Promise<ComputedTurnosExtra | null> {
  const since = subWeeks(new Date(), 8);
  const tes = await prisma.opsTurnoExtra.findMany({
    where: { tenantId, installationId, date: { gte: since } },
    select: {
      amountClp: true,
      installation: { select: { name: true } },
    },
  });
  if (tes.length === 0) return null;
  const total = tes.reduce((s, t) => s + Number(t.amountClp ?? 0), 0);
  if (total <= 0) return null;
  // Promedio semanal directo: total / 8 semanas
  const weekly = Math.round(total / 8);
  return {
    amount: weekly,
    name: tes[0]?.installation?.name ?? null,
    detail: `Promedio semanal rolling 8 semanas (${tes.length} TE históricos)`,
  };
}

/**
 * Modo PCT_PAYROLL: porcentaje sobre el SUELDO BASE total de los puestos
 * activos de la instalación. El monto resultante es el egreso SEMANAL de TE
 * (mensual / 4.33), ya que el ítem se proyecta semanalmente.
 */
async function computeAsPctOfPayroll(
  tenantId: string,
  installationId: string,
  pct: number,
): Promise<ComputedTurnosExtra | null> {
  if (pct <= 0) return null;
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
  let salaryTotal = 0;
  let name: string | null = null;
  for (const p of puestos) {
    if (!p.salaryStructure) continue;
    if (!name) name = p.installation?.name ?? null;
    const baseSalary = Number(p.salaryStructure.baseSalary ?? 0);
    if (baseSalary <= 0) continue;
    salaryTotal += baseSalary;
  }
  if (salaryTotal <= 0) return null;
  const monthlyAmount = Math.round(salaryTotal * pct);
  // Convertir a egreso semanal (el ítem se repite semanalmente)
  const weeklyAmount = Math.round(monthlyAmount / 4.33);
  return {
    amount: weeklyAmount,
    name,
    detail: `${(pct * 100).toFixed(1)}% de sueldos brutos (semanal)`,
  };
}

export async function syncTurnosExtraItemForInstallation(
  tenantId: string,
  installationId: string,
): Promise<{ action: SyncAction }> {
  const cat = await prisma.financeCashflowCategory.findFirst({
    where: { tenantId, code: TE_CATEGORY_CODE, isActive: true },
    select: { id: true },
  });
  if (!cat) return { action: "noop" };

  const config = await prisma.financeCashflowConfig.findUnique({
    where: { tenantId },
    select: { turnosExtraMode: true, turnosExtraPercentage: true },
  });
  const mode = config?.turnosExtraMode ?? "HISTORICAL";
  const pct = Number(config?.turnosExtraPercentage ?? 0);

  const computed =
    mode === "PCT_PAYROLL"
      ? await computeAsPctOfPayroll(tenantId, installationId, pct)
      : await computeHistorical(tenantId, installationId);

  const existing = await prisma.financeCashflowItem.findFirst({
    where: { tenantId, source: "TURNOS_EXTRA", sourceRefId: installationId },
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
    source: "TURNOS_EXTRA" as const,
    sourceRefId: installationId,
    name: `Turnos extra · ${computed.name ?? "instalación"}`,
    description: computed.detail,
    amount: computed.amount,
    currency: "CLP",
    recurrence: "WEEKLY" as const,
    dayOfMonth: null,
    dayOfWeek: 5, // viernes (0=Dom … 5=Vie)
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

export async function recomputeTurnosExtraAmounts(tenantId: string): Promise<RecomputeStats> {
  const installations = await prisma.crmInstallation.findMany({
    where: { tenantId },
    select: { id: true },
  });
  const orphans = await prisma.financeCashflowItem.findMany({
    where: { tenantId, source: "TURNOS_EXTRA" },
    select: { sourceRefId: true },
  });
  const targets = new Set<string>();
  for (const i of installations) targets.add(i.id);
  for (const o of orphans) if (o.sourceRefId) targets.add(o.sourceRefId);

  const stats: RecomputeStats = { created: 0, updated: 0, reactivated: 0, deactivated: 0 };
  for (const id of targets) {
    const r = await syncTurnosExtraItemForInstallation(tenantId, id);
    if (r.action === "created") stats.created++;
    else if (r.action === "updated") stats.updated++;
    else if (r.action === "reactivated") stats.reactivated++;
    else if (r.action === "deactivated") stats.deactivated++;
  }
  return stats;
}

export async function setTurnosExtraItemsActive(
  tenantId: string,
  active: boolean,
): Promise<{ affected: number }> {
  const r = await prisma.financeCashflowItem.updateMany({
    where: { tenantId, source: "TURNOS_EXTRA" },
    data: { isActive: active },
  });
  return { affected: r.count };
}
