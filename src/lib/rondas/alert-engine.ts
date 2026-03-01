import { prisma } from "@/lib/prisma";
import { isWithinGeoRadius, speedKmh } from "@/lib/rondas/geo-utils";
import { getAlertConfig, type AlertConfig } from "@/lib/rondas/ia-config";

export async function evaluatePostMarkAlerts(input: {
  tenantId: string;
  ejecucionId: string;
  installationId: string;
  guardiaId: string;
  checkpointId: string;
  checkpointName: string;
  templateOrderMode: string;
  marcacion: {
    lat: number;
    lng: number;
    verificationMethod: string;
    geoDistanciaM: number | null;
    checkpointRadius: number;
    timestamp: Date;
  };
}): Promise<void> {
  const config: AlertConfig = await getAlertConfig(input.tenantId);

  const alerts: Array<{
    tipo: string;
    severidad: string;
    mensaje: string;
    data: Record<string, unknown>;
  }> = [];

  const prevMarcaciones = await prisma.opsMarcacionCheckpoint.findMany({
    where: {
      ejecucionId: input.ejecucionId,
      checkpointId: { not: input.checkpointId },
      status: "COMPLETED",
    },
    orderBy: { timestamp: "desc" },
    take: 1,
    select: { lat: true, lng: true, timestamp: true, checkpointId: true },
  });

  const prev = prevMarcaciones[0];

  // 1. GEOFENCE BREACH
  if (
    config.routeDeviationEnabled &&
    input.marcacion.verificationMethod === "GEOFENCE" &&
    input.marcacion.geoDistanciaM != null &&
    input.marcacion.geoDistanciaM > input.marcacion.checkpointRadius * config.routeDeviationMultiplier
  ) {
    alerts.push({
      tipo: "breach_geocerca",
      severidad: "critical",
      mensaje: `Guardia marcó checkpoint ${input.checkpointName} desde ${Math.round(input.marcacion.geoDistanciaM)}m (límite: ${input.marcacion.checkpointRadius}m)`,
      data: {
        distanceM: input.marcacion.geoDistanciaM,
        radiusM: input.marcacion.checkpointRadius,
        checkpointId: input.checkpointId,
      },
    });
  }

  if (prev) {
    const elapsedSec = Math.max(1, (input.marcacion.timestamp.getTime() - prev.timestamp.getTime()) / 1000);

    // 2. STATIC GUARD
    if (config.staticGuardEnabled && elapsedSec > config.staticGuardMinutes * 60) {
      const distFromPrev = prev.lat != null && prev.lng != null
        ? isWithinGeoRadius(input.marcacion.lat, input.marcacion.lng, prev.lat, prev.lng, 100000).distanceM ?? 0
        : 0;
      if (distFromPrev < 10) {
        alerts.push({
          tipo: "guardia_estatico",
          severidad: "critical",
          mensaje: `Guardia sin movimiento por ${Math.round(elapsedSec / 60)} minutos entre checkpoints`,
          data: { elapsedSeconds: elapsedSec, distanceM: distFromPrev },
        });
      }
    }

    // 3. SPEED ANOMALY
    if (config.speedAnomalyEnabled && prev.lat != null && prev.lng != null) {
      const dist = isWithinGeoRadius(input.marcacion.lat, input.marcacion.lng, prev.lat, prev.lng, 100000).distanceM ?? 0;
      const speed = speedKmh(dist, elapsedSec);
      if (speed > config.speedAnomalyKmh) {
        alerts.push({
          tipo: "velocidad_anomala",
          severidad: "warning",
          mensaje: `Velocidad anómala detectada: ${speed.toFixed(1)} km/h entre checkpoints`,
          data: { speedKmh: speed, distanceM: dist, elapsedSec },
        });
      }
    }
  }

  // 4. CHECKPOINT OUT OF ORDER (strict mode)
  if (config.checkpointSkippedEnabled && input.templateOrderMode === "strict") {
    const templateCheckpoints = await prisma.opsRondaCheckpoint.findMany({
      where: { rondaTemplate: { ejecuciones: { some: { id: input.ejecucionId } } } },
      orderBy: { orderIndex: "asc" },
      select: { checkpointId: true, orderIndex: true },
    });

    const completedCount = await prisma.opsMarcacionCheckpoint.count({
      where: { ejecucionId: input.ejecucionId, status: "COMPLETED" },
    });

    const expectedCp = templateCheckpoints[completedCount - 1];
    if (expectedCp && expectedCp.checkpointId !== input.checkpointId) {
      alerts.push({
        tipo: "checkpoint_saltado",
        severidad: "warning",
        mensaje: `Checkpoint ${input.checkpointName} marcado fuera de orden (se esperaba otro)`,
        data: {
          expectedCheckpointId: expectedCp.checkpointId,
          actualCheckpointId: input.checkpointId,
          position: completedCount,
        },
      });
    }
  }

  if (alerts.length > 0) {
    await prisma.opsAlertaRonda.createMany({
      data: alerts.map(a => ({
        tenantId: input.tenantId,
        ejecucionId: input.ejecucionId,
        installationId: input.installationId,
        guardiaId: input.guardiaId,
        tipo: a.tipo,
        severidad: a.severidad,
        mensaje: a.mensaje,
        data: a.data as never,
      })),
    });
  }
}

export async function checkPendingRounds(tenantId: string): Promise<{ alertsCreated: number }> {
  const config = await getAlertConfig(tenantId);
  if (!config.roundNotStartedEnabled) return { alertsCreated: 0 };

  const now = new Date();

  const activeProgramaciones = await prisma.opsRondaProgramacion.findMany({
    where: { tenantId, isActive: true },
    include: {
      rondaTemplate: { select: { id: true, installationId: true, name: true } },
    },
  });

  let alertsCreated = 0;

  for (const prog of activeProgramaciones) {
    const toleranceMs = (prog.toleranciaMinutos || config.roundNotStartedMinutes) * 60 * 1000;

    const pendingEjecuciones = await prisma.opsRondaEjecucion.findMany({
      where: {
        tenantId,
        programacionId: prog.id,
        status: "pendiente",
        scheduledAt: { lte: new Date(now.getTime() - toleranceMs) },
      },
      select: { id: true, scheduledAt: true },
    });

    for (const ej of pendingEjecuciones) {
      const existingAlert = await prisma.opsAlertaRonda.findFirst({
        where: {
          ejecucionId: ej.id,
          tipo: "ronda_no_iniciada",
        },
        select: { id: true },
      });

      if (!existingAlert) {
        await prisma.opsAlertaRonda.create({
          data: {
            tenantId,
            ejecucionId: ej.id,
            installationId: prog.rondaTemplate.installationId,
            tipo: "ronda_no_iniciada",
            severidad: "critical",
            mensaje: `Ronda "${prog.rondaTemplate.name}" no iniciada. Programada: ${ej.scheduledAt.toLocaleTimeString("es-CL")}`,
            data: {
              scheduledAt: ej.scheduledAt.toISOString(),
              toleranciaMinutos: prog.toleranciaMinutos,
              templateName: prog.rondaTemplate.name,
            } as never,
          },
        });
        alertsCreated++;
      }
    }
  }

  return { alertsCreated };
}
