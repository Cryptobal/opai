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
  }>,
): Promise<FinanceCashflowConfig> {
  await getOrCreateCashflowConfig(tenantId);
  return prisma.financeCashflowConfig.update({
    where: { tenantId },
    data: patch,
  });
}
