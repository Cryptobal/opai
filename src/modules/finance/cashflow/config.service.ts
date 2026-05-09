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
    ivaPayDay: number;
    matchAmountToleranceClp: number;
    matchDaysTolerance: number;
  }>,
): Promise<FinanceCashflowConfig> {
  await getOrCreateCashflowConfig(tenantId);
  return prisma.financeCashflowConfig.update({
    where: { tenantId },
    data: patch,
  });
}
