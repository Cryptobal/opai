/**
 * GET/POST /api/cron/biometric-cleanup
 * Destrucción de biometría y datos personales de desvinculados (Art. 57.4).
 * Conserva marcaciones y reportes. El día 2 también dispara el respaldo mensual.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { isEligibleForPersonalDataDestruction } from "@/lib/marcacion-retencion";
import { runRespaldoMarcaciones, shouldRunMonthlyRespaldo } from "@/lib/marcacion-respaldo";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(request: Request) {
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
      OR: [
        { faceIdRegistered: true },
        { faceIdAwsId: { not: null } },
        { faceIdPhotoKey: { not: null } },
        { personalEmail: { not: null } },
        { persona: { OR: [
          { personalEmail: { not: null } },
          { phone: { not: null } },
          { phoneMobile: { not: null } },
        ] } },
      ],
    },
    select: {
      id: true,
      tenantId: true,
      faceIdAwsId: true,
      faceIdPhotoUrl: true,
      faceIdPhotoKey: true,
      faceIdRegistered: true,
      personalEmail: true,
      terminatedAt: true,
      persona: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          rut: true,
          personalEmail: true,
          phone: true,
          phoneMobile: true,
        },
      },
    },
  });

  let cleaned = 0;
  let piiDestroyed = 0;
  let errors = 0;
  const criticalAlerts: string[] = [];

  for (const guardia of guardiasToClean) {
    if (!isEligibleForPersonalDataDestruction(guardia.terminatedAt, now)) continue;
    try {
      if (guardia.faceIdAwsId) {
        try {
          const { deleteFace } = await import("@/lib/services/rekognition");
          await deleteFace(guardia.faceIdAwsId);
        } catch {
          // Rekognition may already not have the face
        }
      }

      if (guardia.faceIdPhotoKey) {
        try {
          const { deleteFile } = await import("@/lib/storage");
          await deleteFile(guardia.faceIdPhotoKey);
        } catch (err) {
          console.error(
            `[biometric-cleanup] Error deleting R2 face photo for guardia ${guardia.id}:`,
            err,
          );
        }
      }

      const hadPii = Boolean(
        guardia.personalEmail ||
          guardia.persona.personalEmail ||
          guardia.persona.phone ||
          guardia.persona.phoneMobile,
      );

      await prisma.$transaction([
        prisma.opsGuardia.update({
          where: { id: guardia.id },
          data: {
            faceIdRegistered: false,
            faceIdAwsId: null,
            faceIdPhotoUrl: null,
            faceIdPhotoKey: null,
            personalEmail: null,
          },
        }),
        prisma.opsPersona.update({
          where: { id: guardia.persona.id },
          data: {
            personalEmail: null,
            phone: null,
            phoneMobile: null,
          },
        }),
      ]);

      await logAudit({
        userId: "system",
        userEmail: "system@opai.cl",
        action: "UPDATE",
        entity: "OpsGuardia",
        entityId: guardia.id,
        details: {
          type: "ART_57_4_DESTRUCTION",
          reason: "Política de retención Res. N°38 (90-120 días post-término)",
          destroyed: ["faceId", "personalEmail", "phone", "phoneMobile"],
          preserved: ["marcaciones", "reportes"],
          terminatedAt: guardia.terminatedAt?.toISOString(),
        },
        tenantId: guardia.tenantId,
      });

      cleaned++;
      if (hadPii) piiDestroyed++;
    } catch {
      errors++;
    }
  }

  const overdue = await prisma.opsGuardia.count({
    where: {
      terminatedAt: { not: null, lt: oneHundredTwentyDaysAgo },
      OR: [
        { faceIdRegistered: true },
        { faceIdAwsId: { not: null } },
        { personalEmail: { not: null } },
      ],
    },
  });

  if (overdue > 0) {
    criticalAlerts.push(
      `ALERTA CRÍTICA: ${overdue} guardias con datos personales/biométricos > 120 días post-término`,
    );
  }

  let respaldo: Awaited<ReturnType<typeof runRespaldoMarcaciones>> | null = null;
  const url = new URL(request.url);
  const forceRespaldo = url.searchParams.get("force") === "1";
  if (forceRespaldo || shouldRunMonthlyRespaldo(now)) {
    respaldo = await runRespaldoMarcaciones(now);
  }

  return NextResponse.json({
    success: true,
    cleaned,
    piiDestroyed,
    errors,
    overdue,
    criticalAlerts,
    respaldo,
    timestamp: now.toISOString(),
  });
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
