import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rondaSyncSchema } from "@/lib/validations/rondas";
import { computeMarcacionHash } from "@/lib/marcacion";
import { isWithinGeoRadius, validateGeofenceWithAccuracy, speedKmh, isSpeedReliable } from "@/lib/rondas/geo-utils";
import { detectCheckpointAnomalies } from "@/lib/rondas/anomaly-detection";
import { calculateRondaTrustScore } from "@/lib/rondas/trust-score-v2";
import { toAlertSeverityFromAnomalies } from "@/lib/rondas/trust-score";
import { getActiveTurnoId } from "@/lib/rondas/get-active-turno";
import { notifyCriticalAlertsBatch } from "@/lib/rondas/alert-notifications";
import { getFullAlertConfig } from "@/lib/rondas/alert-config-service";
import { DEFAULT_SPEED_THRESHOLD_KMH } from "@/lib/rondas/ia-config";

export async function POST(request: NextRequest) {
  try {
    console.log(`[public/ronda] POST /api/public/ronda/sync — ${new Date().toISOString()}`);
    const body = await request.json();
    const parsed = rondaSyncSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Datos inválidos", details: parsed.error.flatten() }, { status: 400 });
    }

    let synced = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const round of parsed.data.rounds) {
      try {
        const roundAlerts: Array<{ tipo: string; severidad: string; mensaje: string }> = [];
        let roundTenantId = "";
        await prisma.$transaction(async (tx) => {
          const template = await tx.opsRondaTemplate.findFirst({
            where: { id: round.templateId },
            include: { checkpoints: { orderBy: { orderIndex: "asc" } } },
          });
          if (!template) throw new Error(`Template ${round.templateId} not found`);
          roundTenantId = template.tenantId;

          const turnoId = await getActiveTurnoId(template.tenantId);
          const fullConfig = await getFullAlertConfig(template.tenantId);
          const speedThreshold = fullConfig.velocidad_anomala?.thresholds?.speedAnomalyKmh ?? DEFAULT_SPEED_THRESHOLD_KMH;

          const ejecucion = await tx.opsRondaEjecucion.create({
            data: {
              tenantId: template.tenantId,
              rondaTemplateId: round.templateId,
              installationId: round.installationId,
              programacionId: round.scheduleId ?? null,
              guardiaId: round.guardiaId,
              status: "completada",
              startedAt: new Date(round.startedAt),
              completedAt: new Date(round.completedAt),
              scheduledAt: new Date(round.startedAt),
              checkpointsTotal: template.checkpoints.length,
              checkpointsCompletados: round.marcaciones.length,
              porcentajeCompletado: template.checkpoints.length > 0
                ? (round.marcaciones.length / template.checkpoints.length) * 100
                : 0,
              isOfflineSync: true,
              syncedAt: new Date(),
              notes: round.notes ?? null,
            },
          });

          const sortedMarcaciones = [...round.marcaciones].sort(
            (a, b) => new Date(a.marcadoAt).getTime() - new Date(b.marcadoAt).getTime(),
          );
          const createdMarks: Array<{ status: "COMPLETED"; timestamp: Date; checkpointId: string }> = [];

          for (let i = 0; i < sortedMarcaciones.length; i++) {
            const m = sortedMarcaciones[i];
            const prevM = i > 0 ? sortedMarcaciones[i - 1] : null;

            const checkpoint = await tx.opsCheckpoint.findFirst({
              where: { id: m.checkpointId, installationId: round.installationId },
              select: { id: true, lat: true, lng: true, geoRadiusM: true, name: true, verificationType: true },
            });
            if (!checkpoint) continue;

            const geo = validateGeofenceWithAccuracy(m.lat, m.lng, checkpoint.lat, checkpoint.lng, checkpoint.geoRadiusM, m.gpsAccuracy);

            // Bloqueo geo: GEOFENCE/BOTH exigen estar en rango; QR-only no
            const vt = checkpoint.verificationType;
            const hasCoords = checkpoint.lat != null && checkpoint.lng != null;
            if (vt === "QR") {
              // QR-only: escaneo es prueba, no validar geo
            } else if ((vt === "GEOFENCE" || vt === "BOTH") && hasCoords && !geo.valid) {
              continue; // Skip mark: fuera de rango
            }
            const elapsedSec = prevM
              ? Math.max(1, (new Date(m.marcadoAt).getTime() - new Date(prevM.marcadoAt).getTime()) / 1000)
              : 0;
            const prevDist = prevM ? (isWithinGeoRadius(m.lat, m.lng, prevM.lat, prevM.lng, 100000).distanceM ?? 0) : 0;
            const rawSpeed = prevM ? speedKmh(prevDist, elapsedSec) : 0;
            const speed = isSpeedReliable(prevDist, m.gpsAccuracy) ? rawSpeed : 0;

            const anomalies = detectCheckpointAnomalies({
              speedFromPrevKmh: speed,
              batteryLevel: m.batteryLevel ?? null,
              speedThresholdKmh: speedThreshold,
              movementScoreThreshold: fullConfig.sin_movimiento?.thresholds?.movementScoreMin,
              batteryLowThreshold: fullConfig.bateria_baja?.thresholds?.batteryLowPercent,
              batteryStaticMinMinutes: fullConfig.bateria_estatica?.thresholds?.batteryStaticMinMinutes,
              elapsedMinutes: prevM ? elapsedSec / 60 : undefined,
            });
            const alertAnomalies = anomalies.filter(code => fullConfig[code]?.enabled !== false);

            const hash = computeMarcacionHash({
              tenantId: template.tenantId,
              guardiaId: round.guardiaId,
              installationId: round.installationId,
              tipo: "checkpoint",
              timestamp: m.marcadoAt,
              lat: m.lat,
              lng: m.lng,
              metodoId: "sync_offline",
            });

            await tx.opsMarcacionCheckpoint.create({
              data: {
                tenantId: template.tenantId,
                ejecucionId: ejecucion.id,
                checkpointId: m.checkpointId,
                guardiaId: round.guardiaId,
                timestamp: new Date(m.marcadoAt),
                lat: m.lat,
                lng: m.lng,
                geoValidada: geo.valid,
                geoDistanciaM: geo.distanceM,
                batteryLevel: m.batteryLevel ?? null,
                motionData: (m.motionData ?? null) as never,
                speedFromPrevKmh: speed,
                timeFromPrevSec: prevM ? elapsedSec : null,
                fotoEvidenciaUrl: m.photoUrl ?? null,
                audioUrl: m.audioUrl ?? null,
                note: m.note ?? null,
                hashIntegridad: hash,
                anomalias: anomalies as never,
                status: "COMPLETED",
                verificationMethod: m.verificationMethod,
                isOfflineSync: true,
              },
            });
            createdMarks.push({ status: "COMPLETED", timestamp: new Date(m.marcadoAt), checkpointId: m.checkpointId });

            if (alertAnomalies.length > 0) {
              const alertSeveridad = toAlertSeverityFromAnomalies(alertAnomalies);
              const alertMensaje = `[Sync] Anomalía en checkpoint ${checkpoint.name}: ${alertAnomalies.join(", ")}`;
              await tx.opsAlertaRonda.create({
                data: {
                  tenantId: template.tenantId,
                  ejecucionId: ejecucion.id,
                  installationId: round.installationId,
                  guardiaId: round.guardiaId,
                  turnoId,
                  tipo: alertAnomalies[0],
                  severidad: alertSeveridad,
                  mensaje: alertMensaje,
                  data: {
                    anomalies: alertAnomalies,
                    checkpointId: m.checkpointId,
                    offline: true,
                    checkpointLat: checkpoint.lat,
                    checkpointLng: checkpoint.lng,
                    checkpointRadius: checkpoint.geoRadiusM,
                    guardiaLat: m.lat,
                    guardiaLng: m.lng,
                    guardiaAccuracy: m.gpsAccuracy ?? null,
                    distancia: geo.distanceM != null ? Math.round(geo.distanceM) : null,
                    geoConfidence: geo.confidence,
                  } as never,
                },
              });
              roundAlerts.push({ tipo: alertAnomalies[0], severidad: alertSeveridad, mensaje: alertMensaje });
            }
          }

          const trustResult = calculateRondaTrustScore({
            ejecucion: {
              startedAt: new Date(round.startedAt),
              completedAt: new Date(round.completedAt),
              scheduledAt: new Date(round.startedAt),
              checkpointsTotal: template.checkpoints.length,
            },
            marcaciones: createdMarks,
            template: { estimatedDurationMin: template.estimatedDurationMin, orderMode: template.orderMode },
            templateCheckpoints: template.checkpoints,
          });

          const pct = template.checkpoints.length > 0
            ? (createdMarks.length / template.checkpoints.length) * 100
            : 0;
          await tx.opsRondaEjecucion.update({
            where: { id: ejecucion.id },
            data: {
              checkpointsCompletados: createdMarks.length,
              porcentajeCompletado: pct,
              trustScore: trustResult.score,
              trustBreakdown: trustResult.breakdown as any,
              durationMinutes: Math.round(
                (new Date(round.completedAt).getTime() - new Date(round.startedAt).getTime()) / 60000,
              ),
            },
          });
        });

        // Push + chat notification for critical alerts from this round (fire-and-forget)
        if (roundAlerts.length > 0 && roundTenantId) {
          notifyCriticalAlertsBatch(roundTenantId, roundAlerts).catch((err) =>
            console.error("[SYNC] Alert notification failed:", err),
          );
        }

        synced++;
      } catch (err) {
        failed++;
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }

    return NextResponse.json({ success: true, data: { synced, failed, errors } });
  } catch (error) {
    console.error("[RONDAS] POST sync", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
