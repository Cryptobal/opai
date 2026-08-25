import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { todayInChile } from "@/lib/dates-cl";
import { parseDateOnly } from "@/lib/ops";
import {
  canCancelHireFromCounts,
  CANCEL_HIRE_REASON,
  isSignedLaborContractDocument,
  type CancelHireEligibility,
} from "@/lib/personas-lifecycle";

export async function countSignedLaborContracts(
  tenantId: string,
  guardiaId: string,
): Promise<number> {
  const [linkedDocs, uploadedSignedPdfs] = await Promise.all([
    prisma.docAssociation.findMany({
      where: {
        entityType: "ops_guardia",
        entityId: guardiaId,
        document: {
          tenantId,
          category: "contrato_laboral",
        },
      },
      select: {
        document: {
          select: {
            category: true,
            signatureStatus: true,
            signedAt: true,
          },
        },
      },
    }),
    prisma.opsDocumentoPersona.count({
      where: {
        tenantId,
        guardiaId,
        type: "contrato_firmado",
        fileUrl: { not: null },
        status: { notIn: ["rechazado", "rejected"] },
      },
    }),
  ]);

  const signedLinked = linkedDocs.filter((row) =>
    isSignedLaborContractDocument(row.document),
  ).length;

  return signedLinked + uploadedSignedPdfs;
}

export async function getCancelHireEligibility(
  tenantId: string,
  guardiaId: string,
  lifecycleStatus: string,
): Promise<CancelHireEligibility> {
  if (lifecycleStatus.toLowerCase() !== "contratado") {
    return canCancelHireFromCounts({
      lifecycleStatus,
      marcaciones: 0,
      liquidaciones: 0,
      signedLaborContracts: 0,
    });
  }

  const [marcaciones, liquidaciones, signedLaborContracts] = await Promise.all([
    prisma.opsMarcacion.count({
      where: { tenantId, guardiaId, deletedAt: null },
    }),
    prisma.payrollLiquidacion.count({
      where: { tenantId, guardiaId, NOT: { status: "VOIDED" } },
    }),
    countSignedLaborContracts(tenantId, guardiaId),
  ]);

  return canCancelHireFromCounts({
    lifecycleStatus,
    marcaciones,
    liquidaciones,
    signedLaborContracts,
  });
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
