import { prisma } from "@/lib/prisma";
import { isWithinGeoRadius, speedKmh } from "@/lib/rondas/geo-utils";
import { getAlertConfig, type AlertConfig } from "@/lib/rondas/ia-config";
import { formatChileTime } from "./timezone";
import { getPusherServer } from "@/lib/chat";
import { getActiveTurnoId } from "./get-active-turno";
import { notifyCriticalAlertsBatch } from "./alert-notifications";

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

  if (alerts.length > 0) {
    const turnoId = await getActiveTurnoId(input.tenantId);
    await prisma.opsAlertaRonda.createMany({
      data: alerts.map(a => ({
        tenantId: input.tenantId,
        ejecucionId: input.ejecucionId,
        installationId: input.installationId,
        guardiaId: input.guardiaId,
        turnoId,
        tipo: a.tipo,
        severidad: a.severidad,
        mensaje: a.mensaje,
        data: a.data as never,
      })),
    });

    // Notify monitoring dashboard
    try {
      const pusher = getPusherServer();
      for (const a of alerts) {
        await pusher.trigger(`monitoreo-${input.tenantId}`, "alerta-ronda", {
          ejecucionId: input.ejecucionId,
          installationId: input.installationId,
          tipo: a.tipo,
          severidad: a.severidad,
          mensaje: a.mensaje,
        });
      }
    } catch (pusherErr) {
      console.error("[ALERT_ENGINE] Pusher trigger failed:", pusherErr);
    }

    // Push + chat notifications for critical alerts (fire-and-forget)
    notifyCriticalAlertsBatch(input.tenantId, alerts).catch((err) =>
      console.error("[ALERT_ENGINE] Alert notification failed:", err),
    );
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

  if (activeProgramaciones.length === 0) return { alertsCreated: 0 };

  // Build a tolerance map: programacionId -> cutoff Date
  const toleranceMap = new Map<string, number>();
  for (const prog of activeProgramaciones) {
    const toleranceMs = (prog.toleranciaMinutos || config.roundNotStartedMinutes) * 60 * 1000;
    toleranceMap.set(prog.id, toleranceMs);
  }

  // 1. Fetch all pending ejecuciones across all programaciones in one query
  //    Use the minimum tolerance to capture all possibly-overdue ejecuciones
  const minToleranceMs = Math.min(...Array.from(toleranceMap.values()));
  const allPendingEjecuciones = await prisma.opsRondaEjecucion.findMany({
    where: {
      tenantId,
      status: "pendiente",
      scheduledAt: { lte: new Date(now.getTime() - minToleranceMs) },
      programacionId: { in: activeProgramaciones.map((p: any) => p.id) },
    },
    include: {
      rondaTemplate: { select: { name: true, installationId: true } },
    },
  });

  if (allPendingEjecuciones.length === 0) return { alertsCreated: 0 };

  // Filter by per-programacion tolerance in JS
  const overdueEjecuciones = allPendingEjecuciones.filter((ej: any) => {
    const toleranceMs = ej.programacionId ? toleranceMap.get(ej.programacionId) ?? 0 : 0;
    return ej.scheduledAt.getTime() <= now.getTime() - toleranceMs;
  });

  if (overdueEjecuciones.length === 0) return { alertsCreated: 0 };

  // 2. Fetch all existing "ronda_no_iniciada" alerts for these ejecuciones in one query
  const existingAlerts = await prisma.opsAlertaRonda.findMany({
    where: {
      tenantId,
      tipo: "ronda_no_iniciada",
      ejecucionId: { in: overdueEjecuciones.map((e: any) => e.id) },
    },
    select: { ejecucionId: true },
  });
  const alreadyAlerted = new Set(existingAlerts.map((a: any) => a.ejecucionId));

  // Build programacion lookup for data field
  const progMap = new Map<string, any>(activeProgramaciones.map((p: any) => [p.id, p]));

  // 3. Create missing alerts in bulk
  const turnoId = await getActiveTurnoId(tenantId);
  const newAlerts = overdueEjecuciones
    .filter((ej: any) => !alreadyAlerted.has(ej.id) && ej.rondaTemplate)
    .map((ej: any) => {
      const prog = ej.programacionId ? progMap.get(ej.programacionId) : undefined;
      return {
        tenantId,
        ejecucionId: ej.id,
        installationId: ej.rondaTemplate.installationId,
        turnoId,
        tipo: "ronda_no_iniciada",
        severidad: "critical",
        mensaje: `Ronda "${ej.rondaTemplate.name}" no iniciada. Programada: ${formatChileTime(ej.scheduledAt)}`,
        data: {
          scheduledAt: ej.scheduledAt.toISOString(),
          toleranciaMinutos: prog?.toleranciaMinutos,
          templateName: ej.rondaTemplate.name,
        } as never,
      };
    });

  if (newAlerts.length > 0) {
    await prisma.opsAlertaRonda.createMany({ data: newAlerts });

    // Notify monitoring dashboard
    try {
      const pusher = getPusherServer();
      for (const a of newAlerts) {
        await pusher.trigger(`monitoreo-${tenantId}`, "alerta-ronda", {
          ejecucionId: a.ejecucionId,
          installationId: a.installationId,
          tipo: a.tipo,
          severidad: a.severidad,
          mensaje: a.mensaje,
        });
      }
    } catch (pusherErr) {
      console.error("[ALERT_ENGINE] Pusher trigger failed:", pusherErr);
    }

    // Push + chat notifications for critical alerts (fire-and-forget)
    notifyCriticalAlertsBatch(tenantId, newAlerts).catch((err) =>
      console.error("[ALERT_ENGINE] Alert notification failed:", err),
    );
  }

  return { alertsCreated: newAlerts.length };
}
