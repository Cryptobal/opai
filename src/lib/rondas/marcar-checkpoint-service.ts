/**
 * Shared business logic for marking checkpoints.
 * Used by both portal/rondas/marcar and public/ronda/marcar endpoints.
 */

import { prisma } from "@/lib/prisma";
import { computeMarcacionHash } from "@/lib/marcacion";
import { detectCheckpointAnomalies, type RondaAnomalyCode } from "@/lib/rondas/anomaly-detection";
import { isWithinGeoRadius, validateGeofenceWithAccuracy, speedKmh, type GeofenceResult } from "@/lib/rondas/geo-utils";
import { computeCheckpointTrustScore, toAlertSeverityFromAnomalies } from "@/lib/rondas/trust-score";
import { evaluatePostMarkAlerts } from "@/lib/rondas/alert-engine";
import { getActiveTurnoId } from "@/lib/rondas/get-active-turno";
import { notifyCriticalAlert } from "@/lib/rondas/alert-notifications";
import { getPusherServer } from "@/lib/chat";

// ── Input / Output types ──

export interface MarcarCheckpointInput {
  ejecucionId: string;
  checkpointId?: string | null;
  checkpointQrCode?: string | null;
  lat: number;
  lng: number;
  gpsAccuracy?: number | null;
  batteryLevel?: number | null;
  motionData?: Record<string, unknown> | null;
  fotoEvidenciaUrl?: string | null;
  audioUrl?: string | null;
  note?: string | null;
  verificationMethod?: string | null;
  isOfflineSync?: boolean;
  /** If provided, auto-assigns guard to execution. If omitted, uses execution's existing guardiaId. */
  guardiaId?: string | null;
  taskResponses?: Array<{ taskId: string; value: unknown; photoUrls?: string[] }> | null;
  /** Override timestamp (for offline sync marks that carry original capture time). */
  timestamp?: Date | null;
}

export interface MarcarCheckpointResult {
  id: string;
  trustScore: number;
  anomalies: RondaAnomalyCode[];
  geo: { valid: boolean; distanceM: number | null };
}

export class MarcarCheckpointError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400,
  ) {
    super(message);
    this.name = "MarcarCheckpointError";
  }
}

// ── Main function ──

export async function marcarCheckpoint(
  input: MarcarCheckpointInput,
): Promise<MarcarCheckpointResult> {
  const {
    ejecucionId,
    checkpointId,
    checkpointQrCode,
    lat,
    lng,
    gpsAccuracy,
    batteryLevel,
    motionData,
    fotoEvidenciaUrl,
    audioUrl,
    note,
    verificationMethod,
    isOfflineSync,
    guardiaId: bodyGuardiaId,
    taskResponses,
    timestamp: overrideTimestamp,
  } = input;

  // 1. Look up execution
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
    throw new MarcarCheckpointError("Ejecución no encontrada", 404);
  }

  // 2. Ad-hoc GPS-only check
  const isAdHocGps = execution.isAdHoc && !checkpointId && !checkpointQrCode;
  if (!isAdHocGps && !checkpointId && !checkpointQrCode) {
    throw new MarcarCheckpointError("checkpointId o checkpointQrCode es requerido");
  }

  // 3. Guard assignment / validation
  let guardiaId = execution.guardiaId;
  if (bodyGuardiaId) {
    // Caller provided a guardiaId — auto-assign or validate
    if (!guardiaId) {
      guardiaId = bodyGuardiaId;
      await prisma.opsRondaEjecucion.update({
        where: { id: execution.id },
        data: { guardiaId: bodyGuardiaId },
      });
    } else if (guardiaId !== bodyGuardiaId) {
      throw new MarcarCheckpointError("guardiaId no coincide con la ejecución", 403);
    }
  } else {
    // No guardiaId from caller — execution must already have one
    if (!guardiaId) {
      throw new MarcarCheckpointError("Ejecución sin guardia asignado");
    }
  }

  const cpInstallationId = execution.rondaTemplate?.installationId ?? execution.installationId;
  if (!cpInstallationId) {
    throw new MarcarCheckpointError("Instalación no encontrada");
  }

  // 4. Resolve checkpoint (skip for ad-hoc GPS-only marks)
  let checkpoint: {
    id: string;
    name: string;
    lat: number | null;
    lng: number | null;
    geoRadiusM: number;
    verificationType: string;
  } | null = null;

  if (!isAdHocGps) {
    checkpoint = await prisma.opsCheckpoint.findFirst({
      where: {
        tenantId: execution.tenantId,
        installationId: cpInstallationId,
        isActive: true,
        ...(checkpointId ? { id: checkpointId } : { qrCode: checkpointQrCode ?? undefined }),
      },
      select: { id: true, name: true, lat: true, lng: true, geoRadiusM: true, verificationType: true },
    });
    if (!checkpoint) {
      throw new MarcarCheckpointError("Checkpoint inválido", 404);
    }

    // QR verification enforcement
    if (
      execution.rondaTemplate?.qrRequerido &&
      (checkpoint.verificationType === "QR" || checkpoint.verificationType === "BOTH") &&
      !checkpointQrCode
    ) {
      throw new MarcarCheckpointError("Se requiere escaneo QR para este checkpoint");
    }
  }

  // 5. Geo validation + speed calculation
  const prev = execution.marcaciones[0];
  const geo: GeofenceResult = checkpoint
    ? validateGeofenceWithAccuracy(lat, lng, checkpoint.lat, checkpoint.lng, checkpoint.geoRadiusM, gpsAccuracy)
    : { valid: true, distanceM: 0, confidence: "unknown" as const };
  const now = overrideTimestamp ?? new Date();
  const elapsedSec = prev ? Math.max(1, Math.round((now.getTime() - prev.timestamp.getTime()) / 1000)) : 0;
  const prevDistance =
    prev?.lat != null && prev?.lng != null
      ? Math.round(isWithinGeoRadius(lat, lng, prev.lat, prev.lng, 100000).distanceM ?? 0)
      : 0;
  const speed = prev ? speedKmh(prevDistance, elapsedSec) : 0;

  // 6. Anomaly detection
  const anomalies = detectCheckpointAnomalies({
    geoValidada: geo.valid,
    speedFromPrevKmh: speed,
    movementScore: Number((motionData?.movementScore as number | undefined) ?? 0),
    batteryLevel: batteryLevel,
    prevBatteryLevel: prev?.batteryLevel ?? null,
    sameGeoAsPrev: Boolean(prev && prevDistance <= 5),
  });

  // 7. Trust score
  const trustScore = computeCheckpointTrustScore({
    geoValidada: geo.valid,
    hasPhoto: Boolean(fotoEvidenciaUrl),
    hasMovement: !anomalies.includes("sin_movimiento"),
    sameDevice: true,
    batteryLevel: batteryLevel ?? null,
    speedFromPrevKmh: speed,
  });

  // 8. Integrity hash
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

  // 9. Transaction: create mark, update execution, create alerts
  const turnoId = await getActiveTurnoId(execution.tenantId);

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
        geoAccuracy: gpsAccuracy ?? null,
        geoConfidence: geo.confidence,
        batteryLevel: batteryLevel ?? null,
        motionData: (motionData ?? null) as never,
        speedFromPrevKmh: speed,
        timeFromPrevSec: prev ? elapsedSec : null,
        fotoEvidenciaUrl: fotoEvidenciaUrl ?? null,
        audioUrl: audioUrl ?? null,
        note: note ?? null,
        hashIntegridad: hash,
        anomalias: anomalies as never,
        status: "COMPLETED",
        verificationMethod: verificationMethod ?? (isAdHocGps ? "GEOFENCE" : checkpointId ? "GEOFENCE" : "QR"),
        isOfflineSync: isOfflineSync ?? false,
      },
    });

    // Save task responses if provided
    if (taskResponses && taskResponses.length > 0) {
      await tx.opsCheckpointTaskResponse.createMany({
        data: taskResponses.map((tr) => ({
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
      : completed; // ad-hoc: total = completed
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
      const baseSeverity = toAlertSeverityFromAnomalies(anomalies);
      const severidad =
        baseSeverity === "critical" &&
        anomalies.includes("geo_fuera_rango") &&
        geo.confidence === "low"
          ? "warning"
          : baseSeverity;
      const geoNote =
        anomalies.includes("geo_fuera_rango") && gpsAccuracy
          ? ` — GPS accuracy: ${Math.round(gpsAccuracy)}m (${geo.confidence === "low" ? "baja confiabilidad" : "alta confiabilidad"})`
          : "";
      await tx.opsAlertaRonda.create({
        data: {
          tenantId: execution.tenantId,
          ejecucionId: execution.id,
          installationId: cpInstallationId,
          turnoId,
          tipo: anomalies[0],
          severidad,
          mensaje: `Anomalía detectada en checkpoint ${cpName}: ${anomalies.join(", ")}${geoNote}`,
          data: {
            checkpointId: checkpoint?.id ?? null,
            checkpointName: cpName,
            anomalies,
            trustScore,
            checkpointLat: checkpoint?.lat ?? null,
            checkpointLng: checkpoint?.lng ?? null,
            checkpointRadius: checkpoint?.geoRadiusM ?? null,
            guardiaLat: lat,
            guardiaLng: lng,
            guardiaAccuracy: gpsAccuracy ?? null,
            distancia: geo.distanceM != null ? Math.round(geo.distanceM) : null,
            geoConfidence: geo.confidence,
          } as never,
        },
      });
    }

    return mark;
  });

  // 10. Fire-and-forget: push + chat notification for critical alerts
  if (anomalies.length) {
    const baseSeverity = toAlertSeverityFromAnomalies(anomalies);
    const severidad =
      baseSeverity === "critical" &&
      anomalies.includes("geo_fuera_rango") &&
      geo.confidence === "low"
        ? "warning"
        : baseSeverity;
    const cpName = checkpoint?.name ?? "Punto GPS";
    notifyCriticalAlert({
      tenantId: execution.tenantId,
      tipo: anomalies[0],
      severidad,
      mensaje: `Anomalía detectada en checkpoint ${cpName}: ${anomalies.join(", ")}`,
    }).catch((err) => console.error("[MARCAR] Alert notification failed:", err));
  }

  // 11. Fire-and-forget: evaluate post-mark alerts
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
    }).catch((err) => console.error("[RONDAS] evaluatePostMarkAlerts error:", err));
  }

  // 12. Fire-and-forget: Pusher event
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

  return {
    id: created.id,
    trustScore,
    anomalies,
    geo: { valid: geo.valid, distanceM: geo.distanceM },
  };
}
