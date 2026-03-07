import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { computeMarcacionHash } from "@/lib/marcacion";
import { detectCheckpointAnomalies } from "@/lib/rondas/anomaly-detection";
import { isWithinGeoRadius, speedKmh } from "@/lib/rondas/geo-utils";
import { computeCheckpointTrustScore, toAlertSeverityFromAnomalies } from "@/lib/rondas/trust-score";
import { evaluatePostMarkAlerts } from "@/lib/rondas/alert-engine";

// ---------------------------------------------------------------------------
// Inline validation — individual mark payload (same shape as /marcar body)
// ---------------------------------------------------------------------------

const markSchema = z.object({
  ejecucionId: z.string().min(1),
  checkpointId: z.string().optional(),
  checkpointQrCode: z.string().optional(),
  lat: z.number(),
  lng: z.number(),
  guardiaId: z.string().min(1),
  batteryLevel: z.number().nullable().optional(),
  motionData: z.record(z.string(), z.unknown()).nullable().optional(),
  fotoEvidenciaUrl: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  verificationMethod: z.string().optional(),
  clientHash: z.string().optional(),
  clientTimestamp: z.string().optional(),
  gpsAccuracy: z.number().optional(),
}).refine((d) => d.checkpointId || d.checkpointQrCode, {
  message: "checkpointId o checkpointQrCode es requerido",
});

const syncBodySchema = z.object({
  marks: z.array(markSchema).min(1).max(200),
});

// ---------------------------------------------------------------------------
// POST handler — batch sync of offline checkpoint marks
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const raw = await request.json();
    const parsed = syncBodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join("; ") },
        { status: 400 },
      );
    }

    const { marks } = parsed.data;
    let synced = 0;
    const errors: string[] = [];

    for (const mark of marks) {
      try {
        await processOneMark(mark);
        synced++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Error desconocido";
        errors.push(`${mark.checkpointId ?? mark.checkpointQrCode ?? "?"}: ${msg}`);
      }
    }

    return NextResponse.json({
      success: true,
      data: { synced, failed: marks.length - synced, errors },
    });
  } catch (error) {
    console.error("[Portal Rondas] sync error:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Process a single mark — mirrors /api/portal/rondas/marcar logic
// ---------------------------------------------------------------------------

type MarkPayload = z.infer<typeof markSchema>;

async function processOneMark(mark: MarkPayload): Promise<void> {
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
    guardiaId: bodyGuardiaId,
  } = mark;

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
  if (!execution) throw new Error("Ejecucion no encontrada");

  // 2. Guard assignment / validation
  let guardiaId = execution.guardiaId;
  if (!guardiaId) {
    guardiaId = bodyGuardiaId;
    await prisma.opsRondaEjecucion.update({
      where: { id: execution.id },
      data: { guardiaId: bodyGuardiaId },
    });
  } else if (guardiaId !== bodyGuardiaId) {
    throw new Error("guardiaId no coincide con la ejecucion");
  }

  // 3. Look up checkpoint
  const checkpoint = await prisma.opsCheckpoint.findFirst({
    where: {
      tenantId: execution.tenantId,
      installationId: execution.rondaTemplate?.installationId ?? execution.installationId ?? undefined,
      isActive: true,
      ...(checkpointId ? { id: checkpointId } : { qrCode: checkpointQrCode }),
    },
    select: { id: true, name: true, lat: true, lng: true, geoRadiusM: true },
  });
  if (!checkpoint) throw new Error("Checkpoint invalido");

  // 4. QR enforcement
  if (
    execution.rondaTemplate?.qrRequerido &&
    ((checkpoint as any).verificationType === "QR" || (checkpoint as any).verificationType === "BOTH") &&
    !checkpointQrCode
  ) {
    throw new Error("Se requiere escaneo QR para este checkpoint");
  }

  // 5. Geo validation + speed calculation
  const prev = execution.marcaciones[0];
  const geo = isWithinGeoRadius(lat, lng, checkpoint.lat, checkpoint.lng, checkpoint.geoRadiusM);

  // Use client timestamp when available (offline marks carry the original capture time)
  let now = new Date();
  if (mark.clientTimestamp) {
    const parsed = new Date(mark.clientTimestamp);
    const ageMs = Date.now() - parsed.getTime();
    // Accept if valid date within the last 48 hours and not in the future
    if (!isNaN(parsed.getTime()) && ageMs >= -60_000 && ageMs <= 48 * 3600_000) {
      now = parsed;
    }
  }
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
    batteryLevel: batteryLevel ?? undefined,
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
    guardiaId: guardiaId!,
    installationId: execution.rondaTemplate?.installationId ?? execution.installationId ?? "",
    tipo: "checkpoint",
    timestamp: now.toISOString(),
    lat,
    lng,
    metodoId: "qr_ronda",
  });

  // 9. Transaction: create mark, update execution, create alerts
  await prisma.$transaction(async (tx) => {
    await tx.opsMarcacionCheckpoint.create({
      data: {
        tenantId: execution.tenantId,
        ejecucionId: execution.id,
        checkpointId: checkpoint.id,
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
        verificationMethod: verificationMethod ?? (checkpointId ? "GEOFENCE" : "QR"),
        isOfflineSync: true,
      },
    });

    const total = await tx.opsRondaCheckpoint.count({
      where: { tenantId: execution.tenantId, rondaTemplateId: execution.rondaTemplateId },
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
      await tx.opsAlertaRonda.create({
        data: {
          tenantId: execution.tenantId,
          ejecucionId: execution.id,
          installationId: execution.rondaTemplate?.installationId ?? execution.installationId ?? undefined,
          tipo: anomalies[0],
          severidad: toAlertSeverityFromAnomalies(anomalies),
          mensaje: `Anomalia detectada en checkpoint ${checkpoint.name}: ${anomalies.join(", ")} (offline sync)`,
          data: {
            checkpointId: checkpoint.id,
            checkpointName: checkpoint.name,
            anomalies,
            trustScore,
          } as never,
        },
      });
    }
  });

  // Post-mark alerts (order compliance, missed windows, etc.) — fire-and-forget
  evaluatePostMarkAlerts({
    tenantId: execution.tenantId,
    ejecucionId: execution.id,
    installationId: execution.rondaTemplate?.installationId ?? execution.installationId ?? "",
    guardiaId: guardiaId!,
    checkpointId: checkpoint.id,
    checkpointName: checkpoint.name,
    templateOrderMode: execution.rondaTemplate?.orderMode ?? "flexible",
    marcacion: {
      lat,
      lng,
      verificationMethod: verificationMethod ?? "QR",
      geoDistanciaM: geo.distanceM,
      checkpointRadius: checkpoint.geoRadiusM,
      timestamp: now,
    },
  }).catch(err => console.error("[RONDAS] evaluatePostMarkAlerts error (sync):", err));
}
