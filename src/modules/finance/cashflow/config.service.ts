import "server-only";
import { prisma } from "@/lib/prisma";
import type { FinanceCashflowConfig } from "@prisma/client";

export async function getOrCreateCashflowConfig(
  tenantId: string,
): Promise<FinanceCashflowConfig> {
  const existing = await prisma.financeCashflowConfig.findUnique({
    where: { tenantId },
  });
  if (existing) return existing;
  return prisma.financeCashflowConfig.create({ data: { tenantId } });
}

/**
 * Preferencia de semanas hacia atrás de la ventana inicial del flujo de caja
 * (grilla de 8 semanas). Se lee de forma DEFENSIVA porque la columna
 * `weeksBackDefault` en `FinanceCashflowConfig` es una migración PENDIENTE de
 * aprobación humana (ver la propuesta de schema en el PR / B6): todavía no
 * existe en el schema ni en la DB, así que el cliente Prisma no la tipa. Este
 * acceso con cast tolerante devuelve el `fallback` hoy y empezará a respetar la
 * preferencia automáticamente cuando la migración se aplique y el cliente se
 * regenere — sin cambios de código aquí ni en los call sites.
 *
 * Rango soportado por diseño: 1 o 2 semanas (default 2). Se clampa por si el
 * valor guardado quedara fuera de rango.
 */
export function resolveWeeksBackDefault(
  config: FinanceCashflowConfig,
  fallback = 2,
): number {
  const raw = (config as { weeksBackDefault?: number | null }).weeksBackDefault;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return fallback;
  return Math.max(0, Math.min(2, raw));
}

export async function updateCashflowConfig(
  tenantId: string,
  patch: Partial<{
    horizonWeeksDefault: number;
    horizonMonthsDefault: number;
    weekStartsOn: number;
    autoSales: boolean;
    autoPayroll: boolean;
    autoTurnosExtra: boolean;
    autoIva: boolean;
    autoRecurringDte: boolean;
    payrollPayDay: number;
    previRedPayDay: number;
    ivaPayDay: number;
    ppmRatePct: number;
    matchAmountToleranceClp: number;
    matchDaysTolerance: number;
    ufMonthlyGrowthPct: number;
    turnosExtraMode: "HISTORICAL" | "PCT_PAYROLL";
    turnosExtraPercentage: number;
    turnosExtraLiquidoDiscountPct: number;
    turnosExtraPreviRedDiscountPct: number;
    retiroSocioPctVentas: number;
    retiroSocioPayDay: number;
    quincenaMode: "FICHA" | "PCT_LIQUIDO";
    quincenaPctLiquido: number;
    quincenaPayDay: number;
    writeOffAutoEnabled: boolean;
    writeOffMaxAmountClp: number;
    writeOffMaxPercent: number;
    writeOffShortPaymentAccountId: string | null;
    writeOffOverPaymentAccountId: string | null;
  }>,
): Promise<FinanceCashflowConfig> {
  await getOrCreateCashflowConfig(tenantId);
  return prisma.financeCashflowConfig.update({
    where: { tenantId },
    data: patch,
  });
}
