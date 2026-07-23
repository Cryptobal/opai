import { prisma } from "@/lib/prisma";
import { currentYearMonthInChile } from "@/lib/dates-cl";

/**
 * Presupuesto mensual de tokens de IA por tenant (setting). Al superarse, los
 * extractores bajo demanda se bloquean; la clasificación base NO se ve afectada
 * (es la que sostiene la bandeja). Lectura fiable de `aiUsageLog` gracias a F0.5
 * (proveedor/modelo/tokens reales).
 */
const BUDGET_KEY = "ai_monthly_token_budget";

/** Inicio del mes en curso (aprox. UTC; suficiente para un presupuesto mensual). */
function monthStart(): Date {
  const { year, month } = currentYearMonthInChile();
  return new Date(Date.UTC(year, month - 1, 1));
}

/** Presupuesto configurado (0 = sin límite). */
export async function getMonthlyTokenBudget(tenantId: string): Promise<number> {
  const row = await prisma.setting.findFirst({
    where: { tenantId, key: BUDGET_KEY },
    select: { value: true },
  });
  const n = row ? Number(row.value) : 0;
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export async function setMonthlyTokenBudget(tenantId: string, budget: number): Promise<void> {
  const value = String(Math.max(0, Math.floor(Number(budget) || 0)));
  await prisma.setting.upsert({
    where: { tenantId_key: { tenantId, key: BUDGET_KEY } },
    update: { value },
    create: { tenantId, key: BUDGET_KEY, value, type: "number", category: "ai" },
  });
}

/** Tokens consumidos en el mes en curso (total; si falta, suma input+output). */
export async function getMonthlyTokensUsed(tenantId: string): Promise<number> {
  const agg = await prisma.aiUsageLog.aggregate({
    where: { tenantId, createdAt: { gte: monthStart() } },
    _sum: { totalTokens: true, inputTokens: true, outputTokens: true },
  });
  const total = agg._sum.totalTokens ?? 0;
  if (total > 0) return total;
  return (agg._sum.inputTokens ?? 0) + (agg._sum.outputTokens ?? 0);
}

export interface AiBudgetStatus {
  /** 0 = sin límite. */
  budget: number;
  used: number;
  exceeded: boolean;
}

export async function getAiBudgetStatus(tenantId: string): Promise<AiBudgetStatus> {
  const [budget, used] = await Promise.all([
    getMonthlyTokenBudget(tenantId),
    getMonthlyTokensUsed(tenantId),
  ]);
  return { budget, used, exceeded: budget > 0 && used >= budget };
}

/** ¿Bloquear extractores bajo demanda por presupuesto? (la clasificación sigue). */
export async function isExtractorBudgetExceeded(tenantId: string): Promise<boolean> {
  return (await getAiBudgetStatus(tenantId)).exceeded;
}

export interface AiFeatureUsage {
  feature: string;
  totalTokens: number;
  estimatedCost: number;
  calls: number;
}

/** Consumo del mes agrupado por feature (para la página de Agentes). */
export async function getMonthlyUsageByFeature(tenantId: string): Promise<AiFeatureUsage[]> {
  const rows = await prisma.aiUsageLog.groupBy({
    by: ["feature"],
    where: { tenantId, createdAt: { gte: monthStart() } },
    _sum: { totalTokens: true, inputTokens: true, outputTokens: true, estimatedCost: true },
    _count: { _all: true },
  });
  return rows
    .map((r) => ({
      feature: r.feature,
      totalTokens:
        (r._sum.totalTokens ?? 0) > 0
          ? (r._sum.totalTokens ?? 0)
          : (r._sum.inputTokens ?? 0) + (r._sum.outputTokens ?? 0),
      estimatedCost: r._sum.estimatedCost ?? 0,
      calls: r._count._all,
    }))
    .sort((a, b) => b.totalTokens - a.totalTokens);
}
