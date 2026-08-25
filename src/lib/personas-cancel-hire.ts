import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { todayInChile } from "@/lib/dates-cl";
import { parseDateOnly } from "@/lib/ops";
import { canCancelHireFromCounts, CANCEL_HIRE_REASON } from "@/lib/personas-lifecycle";

export async function getCancelHireEligibility(
  tenantId: string,
  guardiaId: string,
  lifecycleStatus: string,
): Promise<{ eligible: boolean; reason: string | null }> {
  if (lifecycleStatus.toLowerCase() !== "contratado") {
    return canCancelHireFromCounts({
      lifecycleStatus,
      marcaciones: 0,
      liquidaciones: 0,
    });
  }

  const [marcaciones, liquidaciones] = await Promise.all([
    prisma.opsMarcacion.count({
      where: { tenantId, guardiaId, deletedAt: null },
    }),
    prisma.payrollLiquidacion.count({
      where: { tenantId, guardiaId, NOT: { status: "VOIDED" } },
    }),
  ]);

  return canCancelHireFromCounts({ lifecycleStatus, marcaciones, liquidaciones });
}

export async function applyCancelHireOperationalCleanup(
  tx: Prisma.TransactionClient,
  params: { tenantId: string; guardiaId: string; asOf: Date },
): Promise<void> {
  const { tenantId, guardiaId, asOf } = params;

  await tx.opsAsignacionGuardia.updateMany({
    where: { guardiaId, tenantId, isActive: true },
    data: {
      isActive: false,
      endDate: asOf,
      reason: CANCEL_HIRE_REASON,
    },
  });

  await tx.opsSerieAsignacion.updateMany({
    where: { guardiaId, tenantId, isActive: true },
    data: { isActive: false, endDate: asOf },
  });

  const dayAfter = new Date(asOf);
  dayAfter.setUTCDate(dayAfter.getUTCDate() + 1);

  await tx.opsPautaMensual.updateMany({
    where: {
      tenantId,
      plannedGuardiaId: guardiaId,
      date: { gte: dayAfter },
    },
    data: {
      previousGuardiaId: guardiaId,
      plannedGuardiaId: null,
      unassignedAt: new Date(),
      unassignedReason: CANCEL_HIRE_REASON,
    },
  });
}

export function cancelHireAsOfDate(ymd?: string | null): Date {
  return parseDateOnly(ymd && /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : todayInChile());
}
