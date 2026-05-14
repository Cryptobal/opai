import "server-only";
import { prisma } from "@/lib/prisma";
import { startOfMonth } from "date-fns";

const QUINCENA_CATEGORY_CODE = "EGR_QUINCENA";

type SyncAction =
  | "created"
  | "updated"
  | "deactivated"
  | "reactivated"
  | "noop";

export interface RecomputeStats {
  created: number;
  updated: number;
  reactivated: number;
  deactivated: number;
}

interface ComputedQuincena {
  amount: number;
  detail: string;
}

/**
 * Modo FICHA: suma `montoAnticipo` de los OpsGuardia con `recibeAnticipo=true`
 * y `status=active` del tenant. Granularidad GLOBAL (no por instalación):
 * el montoAnticipo vive en la ficha del guardia, no en el puesto, y los
 * guardias rotan entre instalaciones.
 */
async function computeFromFichas(
  tenantId: string,
): Promise<ComputedQuincena | null> {
  const rows = await prisma.opsGuardia.findMany({
    where: { tenantId, status: "active", recibeAnticipo: true },
    select: { montoAnticipo: true },
  });
  if (rows.length === 0) return null;
  const total = rows.reduce((s, r) => s + Number(r.montoAnticipo ?? 0), 0);
  if (total <= 0) return null;
  return {
    amount: Math.round(total),
    detail: `${rows.length} guardia${rows.length === 1 ? "" : "s"} con anticipo en ficha`,
  };
}

/**
 * Modo PCT_LIQUIDO: porcentaje sobre la suma de items source=PAYROLL_LIQUIDO
 * activos del tenant. Esos items ya proyectan el líquido mensual por
 * instalación (creados por payroll-sync) — sumarlos da el líquido total del
 * tenant.
 */
async function computeFromPctLiquido(
  tenantId: string,
  pct: number,
): Promise<ComputedQuincena | null> {
  if (pct <= 0) return null;
  const items = await prisma.financeCashflowItem.findMany({
    where: { tenantId, source: "PAYROLL_LIQUIDO", isActive: true },
    select: { amount: true },
  });
  if (items.length === 0) return null;
  const totalLiquido = items.reduce((s, i) => s + Number(i.amount ?? 0), 0);
  if (totalLiquido <= 0) return null;
  const amount = Math.round(totalLiquido * pct);
  if (amount <= 0) return null;
  return {
    amount,
    detail: `${(pct * 100).toFixed(1)}% de sueldos líquidos proyectados (${items.length} líneas)`,
  };
}

/**
 * Idempotente: 1 item QUINCENA por tenant (no por instalación). Recurrence
 * MONTHLY con dayOfMonth=config.quincenaPayDay (default 15).
 */
export async function recomputeQuincenaAmount(
  tenantId: string,
): Promise<{ action: SyncAction }> {
  const cat = await prisma.financeCashflowCategory.findFirst({
    where: { tenantId, code: QUINCENA_CATEGORY_CODE, isActive: true },
    select: { id: true },
  });
  if (!cat) return { action: "noop" };

  const config = await prisma.financeCashflowConfig.findUnique({
    where: { tenantId },
    select: {
      quincenaMode: true,
      quincenaPctLiquido: true,
      quincenaPayDay: true,
    },
  });
  const mode = config?.quincenaMode ?? "FICHA";
  const pct = Number(config?.quincenaPctLiquido ?? 0.10);
  const payDay = config?.quincenaPayDay ?? 15;

  const computed =
    mode === "PCT_LIQUIDO"
      ? await computeFromPctLiquido(tenantId, pct)
      : await computeFromFichas(tenantId);

  const existing = await prisma.financeCashflowItem.findFirst({
    where: { tenantId, source: "QUINCENA" },
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
    source: "QUINCENA" as const,
    sourceRefId: null,
    name: "Quincena / anticipo guardias",
    description: `Modo ${mode} · ${computed.detail}`,
    amount: computed.amount,
    currency: "CLP",
    recurrence: "MONTHLY" as const,
    dayOfMonth: payDay,
    dayOfWeek: null,
    monthOfYear: null,
    startDate: startOfMonth(new Date()),
    endDate: null,
    installationId: null,
    isActive: true,
  };

  if (existing) {
    await prisma.financeCashflowItem.update({ where: { id: existing.id }, data });
    return { action: existing.isActive ? "updated" : "reactivated" };
  }
  await prisma.financeCashflowItem.create({ data });
  return { action: "created" };
}

export async function recomputeQuincenaAmounts(
  tenantId: string,
): Promise<RecomputeStats> {
  const stats: RecomputeStats = { created: 0, updated: 0, reactivated: 0, deactivated: 0 };
  const r = await recomputeQuincenaAmount(tenantId);
  if (r.action === "created") stats.created++;
  else if (r.action === "updated") stats.updated++;
  else if (r.action === "reactivated") stats.reactivated++;
  else if (r.action === "deactivated") stats.deactivated++;
  return stats;
}

export async function setQuincenaItemsActive(
  tenantId: string,
  active: boolean,
): Promise<{ affected: number }> {
  const r = await prisma.financeCashflowItem.updateMany({
    where: { tenantId, source: "QUINCENA" },
    data: { isActive: active },
  });
  return { affected: r.count };
}
