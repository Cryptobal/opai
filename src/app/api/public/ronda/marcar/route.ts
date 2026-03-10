import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseBody } from "@/lib/api-auth";
import { rondaMarkSchema } from "@/lib/validations/rondas";
import { computeMarcacionHash } from "@/lib/marcacion";
import { detectCheckpointAnomalies } from "@/lib/rondas/anomaly-detection";
import { isWithinGeoRadius, speedKmh } from "@/lib/rondas/geo-utils";
import { computeCheckpointTrustScore, toAlertSeverityFromAnomalies } from "@/lib/rondas/trust-score";
import { evaluatePostMarkAlerts } from "@/lib/rondas/alert-engine";
import { getActiveTurnoId } from "@/lib/rondas/get-active-turno";
import { notifyCriticalAlert } from "@/lib/rondas/alert-notifications";

export async function POST(request: NextRequest) {
  try {
    console.log(`[public/ronda] POST /api/public/ronda/marcar — ${new Date().toISOString()}`);
    const parsed = await parseBody(request, rondaMarkSchema);
    if (parsed.error) return parsed.error;

    const execution = await prisma.opsRondaEjecucion.findFirst({
      where: {
        id: parsed.data.executionId,
        status: { in: ["en_curso", "pendiente", "incompleta"] },
      },
      include: {
        rondaTemplate: { include: { installation: true } },
        marcaciones: { orderBy: { timestamp: "desc" }, take: 1 },
      },
    });
    if (!execution) {
      return NextResponse.json({ success: false, error: "Ejecución no encontrada" }, { status: 404 });
    }
    if (!execution.guardiaId) {
      return NextResponse.json({ success: false, error: "Ejecución sin guardia asignado" }, { status: 400 });
    }
    const guardiaId = execution.guardiaId;
    const installationId = execution.rondaTemplate?.installationId ?? execution.installationId;
    if (!installationId) {
      return NextResponse.json(
        { success: false, error: "La ejecución no tiene instalación asociada" },
        { status: 400 },
      );
    }
    const rondaTemplateId = execution.rondaTemplateId;
    if (!rondaTemplateId) {
      return NextResponse.json(
        { success: false, error: "La ejecución no tiene plantilla de ronda asociada" },
        { status: 400 },
      );
    }

    const checkpoint = await prisma.opsCheckpoint.findFirst({
      where: {
        tenantId: execution.tenantId,
        installationId,
        isActive: true,
        ...(parsed.data.checkpointId
          ? { id: parsed.data.checkpointId }
          : { qrCode: parsed.data.checkpointQrCode }),
      },
      select: { id: true, name: true, lat: true, lng: true, geoRadiusM: true },
    });
    if (!checkpoint) {
      return NextResponse.json({ success: false, error: "Checkpoint inválido" }, { status: 404 });
    }

    const prev = execution.marcaciones[0];
    const geo = isWithinGeoRadius(
      parsed.data.lat,
      parsed.data.lng,
      checkpoint.lat,
      checkpoint.lng,
      checkpoint.geoRadiusM,
    );
    const now = new Date();
    const elapsedSec = prev ? Math.max(1, Math.round((now.getTime() - prev.timestamp.getTime()) / 1000)) : 0;
    const prevDistance = prev?.lat != null && prev?.lng != null
      ? Math.round(isWithinGeoRadius(parsed.data.lat, parsed.data.lng, prev.lat, prev.lng, 100000).distanceM ?? 0)
      : 0;
    const speed = prev ? speedKmh(prevDistance, elapsedSec) : 0;
    const anomalies = detectCheckpointAnomalies({
      geoValidada: geo.valid,
      speedFromPrevKmh: speed,
      movementScore: Number((parsed.data.motionData?.movementScore as number | undefined) ?? 0),
      batteryLevel: parsed.data.batteryLevel,
      prevBatteryLevel: prev?.batteryLevel ?? null,
      sameGeoAsPrev: Boolean(prev && prevDistance <= 5),
    });

    const trustScore = computeCheckpointTrustScore({
      geoValidada: geo.valid,
      hasPhoto: Boolean(parsed.data.fotoEvidenciaUrl),
      hasMovement: !anomalies.includes("sin_movimiento"),
      sameDevice: true,
      batteryLevel: parsed.data.batteryLevel ?? null,
      speedFromPrevKmh: speed,
    });

    const hash = computeMarcacionHash({
      tenantId: execution.tenantId,
      guardiaId: execution.guardiaId ?? "unknown",
      installationId,
      tipo: "checkpoint",
      timestamp: now.toISOString(),
      lat: parsed.data.lat,
      lng: parsed.data.lng,
      metodoId: "qr_ronda",
    });

    const turnoId = await getActiveTurnoId(execution.tenantId);

    const created = await prisma.$transaction(async (tx) => {
      const mark = await tx.opsMarcacionCheckpoint.create({
        data: {
          tenantId: execution.tenantId,
          ejecucionId: execution.id,
          checkpointId: checkpoint.id,
          guardiaId,
          timestamp: now,
          lat: parsed.data.lat,
          lng: parsed.data.lng,
          geoValidada: geo.valid,
          geoDistanciaM: geo.distanceM,
          batteryLevel: parsed.data.batteryLevel ?? null,
          motionData: (parsed.data.motionData ?? null) as never,
          speedFromPrevKmh: speed,
          timeFromPrevSec: prev ? elapsedSec : null,
          fotoEvidenciaUrl: parsed.data.fotoEvidenciaUrl ?? null,
          audioUrl: parsed.data.audioUrl ?? null,
          note: parsed.data.note ?? null,
          hashIntegridad: hash,
          anomalias: anomalies as never,
          status: "COMPLETED",
          verificationMethod: parsed.data.verificationMethod ?? (parsed.data.checkpointId ? "GEOFENCE" : "QR"),
          isOfflineSync: parsed.data.isOfflineSync ?? false,
        },
      });

      const total = await tx.opsRondaCheckpoint.count({
        where: { tenantId: execution.tenantId, rondaTemplateId },
      });
      const completed = await tx.opsMarcacionCheckpoint.count({
        where: { tenantId: execution.tenantId, ejecucionId: execution.id },
      });
      const pct = total > 0 ? (completed / total) * 100 : 0;

      const trustRows = await tx.opsMarcacionCheckpoint.findMany({
        where: { tenantId: execution.tenantId, ejecucionId: execution.id },
        select: { anomalias: true },
      });
      const severeCount = trustRows.filter((r) => ((r.anomalias as string[] | null) ?? []).length > 0).length;
      const avgTrust = Math.round(Math.max(0, 100 - (severeCount * 100) / Math.max(1, trustRows.length)));

      await tx.opsRondaEjecucion.update({
        where: { id: execution.id },
        data: {
          status: "en_curso",
          checkpointsCompletados: completed,
          checkpointsTotal: total,
          porcentajeCompletado: pct,
          trustScore: avgTrust,
        },
      });

      if (anomalies.length) {
        await tx.opsAlertaRonda.create({
          data: {
            tenantId: execution.tenantId,
            ejecucionId: execution.id,
            installationId,
            turnoId,
            tipo: anomalies[0],
            severidad: toAlertSeverityFromAnomalies(anomalies),
            mensaje: `Anomalía detectada en checkpoint ${checkpoint.name}: ${anomalies.join(", ")}`,
            data: {
              checkpointId: checkpoint.id,
              checkpointName: checkpoint.name,
              anomalies,
              trustScore,
            } as never,
          },
        });
      }

      return mark;
    });

    // Push + chat notification for critical anomaly alerts (fire-and-forget)
    if (anomalies.length) {
      const severidad = toAlertSeverityFromAnomalies(anomalies);
      notifyCriticalAlert({
        tenantId: execution.tenantId,
        tipo: anomalies[0],
        severidad,
        mensaje: `Anomalía detectada en checkpoint ${checkpoint.name}: ${anomalies.join(", ")}`,
      }).catch((err) => console.error("[MARCAR] Alert notification failed:", err));
    }

    // Evaluate post-mark alerts asynchronously (don't block response)
    if (execution.rondaTemplate) evaluatePostMarkAlerts({
      tenantId: execution.tenantId,
      ejecucionId: execution.id,
      installationId,
      guardiaId,
      checkpointId: checkpoint.id,
      checkpointName: checkpoint.name,
      templateOrderMode: execution.rondaTemplate.orderMode ?? "flexible",
      marcacion: {
        lat: parsed.data.lat,
        lng: parsed.data.lng,
        verificationMethod: parsed.data.verificationMethod ?? "QR",
        geoDistanciaM: geo.distanceM,
        checkpointRadius: checkpoint.geoRadiusM,
        timestamp: now,
      },
    }).catch(err => console.error("[RONDAS] evaluatePostMarkAlerts error:", err));

    return NextResponse.json({
      success: true,
      data: {
        id: created.id,
        trustScore,
        anomalies,
        geo: { valid: geo.valid, distanceM: geo.distanceM },
      },
    });
  } catch (error) {
    console.error("[RONDAS] public marcar", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
