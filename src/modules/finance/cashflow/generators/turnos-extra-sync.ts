import "server-only";
import { prisma } from "@/lib/prisma";
import { startOfMonth, subWeeks } from "date-fns";

const TE_CATEGORY_CODE = "EGR_TURNO_EXTRA";

type SyncAction = "created" | "updated" | "deactivated" | "reactivated" | "noop";

/**
 * Calcula el promedio rolling de turnos extra mensuales para una instalación
 * (suma últimas 8 semanas / 8 * 4.33 = aprox mensual).
 */
async function computeMonthlyTurnosExtraForInstallation(
  tenantId: string,
  installationId: string,
): Promise<{ amount: number; name: string | null; count: number } | null> {
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
  // Proyección mensual: total 8 semanas / 8 * 4.33 (semanas/mes promedio)
  const monthly = (total / 8) * 4.33;
  const name = tes[0]?.installation?.name ?? null;
  return { amount: Math.round(monthly), name, count: tes.length };
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

  const computed = await computeMonthlyTurnosExtraForInstallation(tenantId, installationId);

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
    description: `Promedio rolling 8 semanas (${computed.count} TE históricos)`,
    amount: computed.amount,
    currency: "CLP",
    recurrence: "MONTHLY" as const,
    dayOfMonth: 20,
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
