import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeMarcacionHash } from "@/lib/marcacion";
import { detectCheckpointAnomalies } from "@/lib/rondas/anomaly-detection";
import { isWithinGeoRadius, speedKmh } from "@/lib/rondas/geo-utils";
import { computeCheckpointTrustScore, toAlertSeverityFromAnomalies } from "@/lib/rondas/trust-score";
import { evaluatePostMarkAlerts } from "@/lib/rondas/alert-engine";
import { getPusherServer } from "@/lib/chat";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      ejecucionId,
      checkpointId,
      checkpointQrCode,
      lat,
      lng,
      batteryLevel,
      motionData,
      fotoEvidenciaUrl,
      note,
      verificationMethod,
      isOfflineSync,
      guardiaId: bodyGuardiaId,
      taskResponses: bodyTaskResponses,
    } = body as {
      ejecucionId?: string;
      checkpointId?: string;
      checkpointQrCode?: string;
      lat?: number;
      lng?: number;
      batteryLevel?: number | null;
      motionData?: Record<string, unknown> | null;
      fotoEvidenciaUrl?: string | null;
      note?: string | null;
      verificationMethod?: string;
      isOfflineSync?: boolean;
      guardiaId?: string;
      taskResponses?: Array<{ taskId: string; value: unknown; photoUrls?: string[] }>;
    };

    // Inline validation for required fields
    if (!ejecucionId || typeof ejecucionId !== "string") {
      return NextResponse.json({ success: false, error: "ejecucionId es requerido" }, { status: 400 });
    }
    if (lat == null || typeof lat !== "number") {
      return NextResponse.json({ success: false, error: "lat es requerido" }, { status: 400 });
    }
    if (lng == null || typeof lng !== "number") {
      return NextResponse.json({ success: false, error: "lng es requerido" }, { status: 400 });
    }
    if (!bodyGuardiaId || typeof bodyGuardiaId !== "string") {
      return NextResponse.json({ success: false, error: "guardiaId es requerido" }, { status: 400 });
    }
    const execution = await prisma.opsRondaEjecucion.findFirst({
      where: {
        id: ejecucionId,
        status: { in: ["en_curso", "pendiente", "incompleta"] },
      },
      include: {
        rondaTemplate: { include: { installation: true } },
        marcaciones: { orderBy: { timestamp: "desc" }, take: 1 },
      },
    });
    if (!execution) {
      return NextResponse.json({ success: false, error: "Ejecucion no encontrada" }, { status: 404 });
    }

    // For non-ad-hoc rounds, checkpointId or checkpointQrCode is required
    const isAdHocGps = execution.isAdHoc && !checkpointId && !checkpointQrCode;
    if (!isAdHocGps && !checkpointId && !checkpointQrCode) {
      return NextResponse.json({ success: false, error: "checkpointId o checkpointQrCode es requerido" }, { status: 400 });
    }

    // Auto-assign guard: if execution has no guardiaId, claim it
    let guardiaId = execution.guardiaId;
    if (!guardiaId) {
      guardiaId = bodyGuardiaId;
      await prisma.opsRondaEjecucion.update({
        where: { id: execution.id },
        data: { guardiaId: bodyGuardiaId },
      });
    } else if (guardiaId !== bodyGuardiaId) {
      return NextResponse.json(
        { success: false, error: "guardiaId no coincide con la ejecución" },
        { status: 403 },
      );
    }

    const cpInstallationId = execution.rondaTemplate?.installationId ?? execution.installationId;
    if (!cpInstallationId) {
      return NextResponse.json({ success: false, error: "Instalacion no encontrada" }, { status: 400 });
    }

    // For ad-hoc GPS-only marks, no checkpoint to resolve
    let checkpoint: { id: string; name: string; lat: number | null; lng: number | null; geoRadiusM: number; verificationType: string } | null = null;

    if (!isAdHocGps) {
      checkpoint = await prisma.opsCheckpoint.findFirst({
        where: {
          tenantId: execution.tenantId,
          installationId: cpInstallationId,
          isActive: true,
          ...(checkpointId
            ? { id: checkpointId }
            : { qrCode: checkpointQrCode }),
        },
        select: { id: true, name: true, lat: true, lng: true, geoRadiusM: true, verificationType: true },
      });
      if (!checkpoint) {
        return NextResponse.json({ success: false, error: "Checkpoint invalido" }, { status: 404 });
      }

      // QR verification enforcement: if template requires QR and checkpoint supports QR/BOTH,
      // the request must include a matching checkpointQrCode
      if (
        execution.rondaTemplate?.qrRequerido &&
        (checkpoint.verificationType === "QR" || checkpoint.verificationType === "BOTH") &&
        !checkpointQrCode
      ) {
        return NextResponse.json(
          { success: false, error: "Se requiere escaneo QR para este checkpoint" },
          { status: 400 },
        );
      }
    }

    const prev = execution.marcaciones[0];
    const geo = checkpoint
      ? isWithinGeoRadius(
          lat,
          lng,
          checkpoint.lat,
          checkpoint.lng,
          checkpoint.geoRadiusM,
        )
      : { valid: true, distanceM: 0 }; // GPS-only ad-hoc: no reference point
    const now = new Date();
    const elapsedSec = prev ? Math.max(1, Math.round((now.getTime() - prev.timestamp.getTime()) / 1000)) : 0;
    const prevDistance = prev?.lat != null && prev?.lng != null
      ? Math.round(isWithinGeoRadius(lat, lng, prev.lat, prev.lng, 100000).distanceM ?? 0)
      : 0;
    const speed = prev ? speedKmh(prevDistance, elapsedSec) : 0;
    const anomalies = detectCheckpointAnomalies({
      geoValidada: geo.valid,
      speedFromPrevKmh: speed,
      movementScore: Number((motionData?.movementScore as number | undefined) ?? 0),
      batteryLevel: batteryLevel,
      prevBatteryLevel: prev?.batteryLevel ?? null,
      sameGeoAsPrev: Boolean(prev && prevDistance <= 5),
    });

    const trustScore = computeCheckpointTrustScore({
      geoValidada: geo.valid,
      hasPhoto: Boolean(fotoEvidenciaUrl),
      hasMovement: !anomalies.includes("sin_movimiento"),
      sameDevice: true,
      batteryLevel: batteryLevel ?? null,
      speedFromPrevKmh: speed,
    });

    const hash = computeMarcacionHash({
      tenantId: execution.tenantId,
      guardiaId: guardiaId ?? "unknown",
      installationId: cpInstallationId,
      tipo: "checkpoint",
      timestamp: now.toISOString(),
      lat,
      lng,
      metodoId: "qr_ronda",
    });

    const created = await prisma.$transaction(async (tx) => {
      const mark = await tx.opsMarcacionCheckpoint.create({
        data: {
          tenantId: execution.tenantId,
          ejecucionId: execution.id,
          checkpointId: checkpoint?.id ?? null,
          guardiaId,
          timestamp: now,
          lat,
          lng,
          geoValidada: geo.valid,
          geoDistanciaM: geo.distanceM,
          batteryLevel: batteryLevel ?? null,
          motionData: (motionData ?? null) as never,
          speedFromPrevKmh: speed,
          timeFromPrevSec: prev ? elapsedSec : null,
          fotoEvidenciaUrl: fotoEvidenciaUrl ?? null,
          note: note ?? null,
          hashIntegridad: hash,
          anomalias: anomalies as never,
          status: "COMPLETED",
          verificationMethod: verificationMethod ?? (isAdHocGps ? "GEOFENCE" : checkpointId ? "GEOFENCE" : "QR"),
          isOfflineSync: isOfflineSync ?? false,
        },
      });

      // Save task responses if provided
      if (bodyTaskResponses && Array.isArray(bodyTaskResponses) && bodyTaskResponses.length > 0) {
        await tx.opsCheckpointTaskResponse.createMany({
          data: bodyTaskResponses.map((tr) => ({
            tenantId: execution.tenantId,
            taskId: tr.taskId,
            marcacionId: mark.id,
            guardiaId,
            value: tr.value as never,
            photoUrls: tr.photoUrls ? (tr.photoUrls as never) : undefined,
            lat,
            lng,
          })),
        });
      }

      const completed = await tx.opsMarcacionCheckpoint.count({
        where: { tenantId: execution.tenantId, ejecucionId: execution.id },
      });
      const total = execution.rondaTemplateId
        ? await tx.opsRondaCheckpoint.count({
            where: { tenantId: execution.tenantId, rondaTemplateId: execution.rondaTemplateId! },
          })
        : completed; // ad-hoc: total = completed (no predefined list)
      const pct = total > 0 ? (completed / total) * 100 : 0;

      const trustRows = await tx.opsMarcacionCheckpoint.findMany({
        where: { tenantId: execution.tenantId, ejecucionId: execution.id },
        select: { anomalias: true },
      });
      const severeCount = trustRows.filter((r) => ((r.anomalias as string[] | null) ?? []).length > 0).length;
      const avgTrust = Math.round(Math.max(0, 100 - (severeCount * 100) / Math.max(1, trustRows.length)));

      // Set startedAt on first mark if not already set
      const updateData: Record<string, unknown> = {
        status: "en_curso",
        checkpointsCompletados: completed,
        checkpointsTotal: total,
        porcentajeCompletado: pct,
        trustScore: avgTrust,
      };
      if (!execution.startedAt) {
        updateData.startedAt = now;
      }

      await tx.opsRondaEjecucion.update({
        where: { id: execution.id },
        data: updateData,
      });

      if (anomalies.length) {
        const cpName = checkpoint?.name ?? "Punto GPS";
        await tx.opsAlertaRonda.create({
          data: {
            tenantId: execution.tenantId,
            ejecucionId: execution.id,
            installationId: cpInstallationId,
            tipo: anomalies[0],
            severidad: toAlertSeverityFromAnomalies(anomalies),
            mensaje: `Anomalia detectada en checkpoint ${cpName}: ${anomalies.join(", ")}`,
            data: {
              checkpointId: checkpoint?.id ?? null,
              checkpointName: cpName,
              anomalies,
              trustScore,
            } as never,
          },
        });
      }

      return mark;
    });

    // Evaluate post-mark alerts asynchronously (don't block response)
    if (execution.rondaTemplate && checkpoint) {
      evaluatePostMarkAlerts({
        tenantId: execution.tenantId,
        ejecucionId: execution.id,
        installationId: execution.rondaTemplate.installationId,
        guardiaId,
        checkpointId: checkpoint.id,
        checkpointName: checkpoint.name,
        templateOrderMode: execution.rondaTemplate.orderMode ?? "flexible",
        marcacion: {
          lat,
          lng,
          verificationMethod: verificationMethod ?? "QR",
          geoDistanciaM: geo.distanceM,
          checkpointRadius: checkpoint.geoRadiusM,
          timestamp: now,
        },
      }).catch(err => console.error("[RONDAS] evaluatePostMarkAlerts error:", err));
    }

    // Fire-and-forget Pusher event
    try {
      const pusher = getPusherServer();
      const cpName = checkpoint?.name ?? "Punto GPS";
      await pusher.trigger(`monitoreo-${execution.tenantId}`, "checkpoint-marked", {
        ejecucionId: execution.id,
        checkpointId: checkpoint?.id ?? null,
        checkpointName: cpName,
        trustScore,
      });
    } catch (pusherErr) {
      console.error("[MARCAR] Pusher trigger failed:", pusherErr);
    }

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
    console.error("[Portal Rondas] marcar checkpoint error:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
