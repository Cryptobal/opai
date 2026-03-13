/**
 * POST /api/cron/biometric-cleanup
 * Limpieza automática de datos biométricos (Resolución N°38)
 * Destruir datos entre 90-120 días post-término del contrato.
 * Ejecutar diariamente.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const cronSecret = request.headers.get("authorization")?.replace("Bearer ", "");
  if (cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const ninetyDaysAgo = new Date(now);
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const oneHundredTwentyDaysAgo = new Date(now);
  oneHundredTwentyDaysAgo.setDate(oneHundredTwentyDaysAgo.getDate() - 120);

  const guardiasToClean = await prisma.opsGuardia.findMany({
    where: {
      terminatedAt: { not: null, lt: ninetyDaysAgo },
      faceIdRegistered: true,
      faceIdAwsId: { not: null },
    },
    select: {
      id: true,
      tenantId: true,
      faceIdAwsId: true,
      faceIdPhotoUrl: true,
      terminatedAt: true,
      persona: { select: { firstName: true, lastName: true, rut: true } },
    },
  });

  let cleaned = 0;
  let errors = 0;
  const criticalAlerts: string[] = [];

  for (const guardia of guardiasToClean) {
    try {
      if (guardia.faceIdAwsId) {
        try {
          const { deleteFace } = await import("@/lib/services/rekognition");
          await deleteFace(guardia.faceIdAwsId);
        } catch {
          // Rekognition may already not have the face
        }
      }

      // TODO: Delete face photo from R2 if faceIdPhotoUrl exists

      await prisma.opsGuardia.update({
        where: { id: guardia.id },
        data: {
          faceIdRegistered: false,
          faceIdAwsId: null,
          faceIdPhotoUrl: null,
        },
      });

      await prisma.auditLog.create({
        data: {
          userId: "system",
          userEmail: "system@opai.cl",
          action: "biometric_data_deleted",
          entity: "OpsGuardia",
          entityId: guardia.id,
          details: {
            reason: "Política de retención Res. N°38 (90-120 días post-término)",
            guardiaRut: guardia.persona?.rut,
            terminatedAt: guardia.terminatedAt?.toISOString(),
          },
          tenantId: guardia.tenantId,
        },
      });

      cleaned++;
    } catch {
      errors++;
    }
  }

  const overdue = await prisma.opsGuardia.count({
    where: {
      terminatedAt: { not: null, lt: oneHundredTwentyDaysAgo },
      faceIdRegistered: true,
      faceIdAwsId: { not: null },
    },
  });

  if (overdue > 0) {
    criticalAlerts.push(
      `ALERTA CRÍTICA: ${overdue} guardias con datos biométricos > 120 días post-término`
    );
  }

  return NextResponse.json({
    success: true,
    cleaned,
    errors,
    overdue,
    criticalAlerts,
    timestamp: now.toISOString(),
  });
}
