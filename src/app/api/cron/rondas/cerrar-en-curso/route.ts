import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPusherServer } from "@/lib/chat";
import { getActiveTurnoId } from "@/lib/rondas/get-active-turno";
import { notifyCriticalAlertsBatch } from "@/lib/rondas/alert-notifications";
import { emitRondasTerminadas } from "@/lib/rondas/lifecycle-notifications";
import { onlyActiveInstallationEjecucion } from "@/lib/rondas/active-installation-filter";

/**
 * CRON: /api/cron/rondas/cerrar-en-curso
 *
 * Auto-closes SCHEDULED (non ad-hoc) rondas that are still "en_curso"
 * once it's time to start the next round in the same programacion.
 *
 * Timeout resolution (first match wins):
 *   1. Next scheduledAt for the same programacionId (closes when next round should start)
 *   2. startedAt + frecuenciaMinutos (if no next round: last round of the day)
 *   3. startedAt + 60 min (fallback when no frequency info available)
 *
 * Runs every 15 minutes via Vercel Cron.
 * Protected with CRON_SECRET env var.
 */

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret && process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { success: false, error: "CRON_SECRET not configured" },
        { status: 500 },
      );
    }
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const now = new Date();

    // Query scheduled rondas currently en_curso (not ad-hoc)
    const enCurso = await prisma.opsRondaEjecucion.findMany({
      where: {
        isAdHoc: false,
        status: "en_curso",
        startedAt: { not: null },
        ...onlyActiveInstallationEjecucion,
      },
      select: {
        id: true,
        tenantId: true,
        installationId: true,
        guardiaId: true,
        startedAt: true,
        scheduledAt: true,
        programacionId: true,
        programacion: {
          select: { frecuenciaMinutos: true },
        },
      },
      take: 500,
    });

    if (enCurso.length === 0) {
      return NextResponse.json({
        success: true,
        data: { cerradas: 0 },
      });
    }

    // For rounds with a programacionId, find the next pending execution
    const programacionIds = [...new Set(
      enCurso.filter((ej) => ej.programacionId).map((ej) => ej.programacionId!)
    )];

    // Fetch the next pending execution for each programacion (the upcoming round)
    const nextRounds = programacionIds.length > 0
      ? await prisma.opsRondaEjecucion.findMany({
          where: {
            programacionId: { in: programacionIds },
            status: "pendiente",
            scheduledAt: { gte: now },
          },
          select: { programacionId: true, scheduledAt: true },
          orderBy: { scheduledAt: "asc" },
        })
      : [];

    // Build map: programacionId → next scheduledAt
    const nextRoundMap = new Map<string, Date>();
    for (const nr of nextRounds) {
      if (nr.programacionId && !nextRoundMap.has(nr.programacionId)) {
        nextRoundMap.set(nr.programacionId, nr.scheduledAt);
      }
    }

    // Determine which rondas should be closed
    const toClose: (typeof enCurso[number] & { closeReason: string })[] = [];

    for (const ej of enCurso) {
      if (!ej.startedAt) continue;

      // Case 1: There is a next scheduled round for this programacion → close when it starts
      if (ej.programacionId) {
        const nextAt = nextRoundMap.get(ej.programacionId);
        if (nextAt && nextAt <= now) {
          toClose.push({ ...ej, closeReason: "next_round_started" });
          continue;
        }
      }

      // Case 2: No next round found (last round of day or no programacion)
      // Close after frecuenciaMinutos since startedAt, fallback to 60 min
      const frecuencia = ej.programacion?.frecuenciaMinutos ?? 60;
      const cutoff = new Date(ej.startedAt.getTime() + frecuencia * 60 * 1000);
      if (cutoff <= now) {
        toClose.push({ ...ej, closeReason: "frequency_elapsed" });
      }
    }

    if (toClose.length === 0) {
      return NextResponse.json({
        success: true,
        data: { cerradas: 0 },
      });
    }

    const allIds = toClose.map((ej) => ej.id);

    // Batch update: close + penalize
    await prisma.opsRondaEjecucion.updateMany({
      where: { id: { in: allIds } },
      data: {
        status: "cerrada_auto",
        completedAt: now,
        trustScore: 0,
        penalizacionMotivo: "Cierre automático: comenzó la siguiente ronda programada",
        trustBreakdown: {
          reason: "auto_closed_next_round_started",
          closedBy: "system_cron",
          closedAt: now.toISOString(),
        } as never,
      },
    });

    // Create alerts
    const alertTenantIds = [...new Set(toClose.map((ej) => ej.tenantId))];
    const turnoMap = new Map<string, string | null>();
    await Promise.all(
      alertTenantIds.map(async (tid) => {
        turnoMap.set(tid, await getActiveTurnoId(tid));
      }),
    );

    const alertData = toClose
      .filter((ej) => ej.installationId)
      .map((ej) => {
        const frecuencia = ej.programacion?.frecuenciaMinutos ?? 60;
        const reason = ej.closeReason === "next_round_started"
          ? "Comenzó la siguiente ronda programada"
          : `Superó el tiempo de frecuencia (${frecuencia} min)`;
        return {
          tenantId: ej.tenantId,
          ejecucionId: ej.id,
          installationId: ej.installationId!,
          guardiaId: ej.guardiaId,
          turnoId: turnoMap.get(ej.tenantId) ?? null,
          tipo: "ronda_en_curso_timeout",
          severidad: "warning",
          mensaje: `Ronda cerrada automáticamente: ${reason}`,
          data: {
            closedAt: now.toISOString(),
            closedBy: "system_cron",
            reason: ej.closeReason,
            frecuenciaMinutos: frecuencia,
          } as never,
        };
      });

    if (alertData.length > 0) {
      await prisma.opsAlertaRonda.createMany({ data: alertData });

      for (const tid of alertTenantIds) {
        const tenantAlerts = alertData.filter((a) => a.tenantId === tid);
        if (tenantAlerts.length > 0) {
          notifyCriticalAlertsBatch(tid, tenantAlerts).catch((err) =>
            console.error("[CRON] cerrar-en-curso notification failed:", err),
          );
        }
      }
    }

    // Notify monitoring dashboards via Pusher
    try {
      const pusher = getPusherServer();
      await Promise.all(
        alertTenantIds.map((tenantId) =>
          pusher.trigger(`monitoreo-${tenantId}`, "ronda-completed", {
            bulkClose: true,
            count: toClose.filter((ej) => ej.tenantId === tenantId).length,
            ids: toClose
              .filter((ej) => ej.tenantId === tenantId)
              .map((ej) => ej.id),
          }),
        ),
      );
    } catch (pusherErr) {
      console.error("[CRON] cerrar-en-curso Pusher trigger failed:", pusherErr);
    }

    // Fase 19: tarjeta ⚠️ de cierre automático por cada ronda (reply del hilo si existe)
    for (const tid of alertTenantIds) {
      const ids = toClose.filter((ej) => ej.tenantId === tid).map((ej) => ej.id);
      await emitRondasTerminadas(tid, ids);
    }

    console.log(
      `[CRON] cerrar-en-curso: ${toClose.length} rondas programadas cerradas automáticamente`,
    );

    return NextResponse.json({
      success: true,
      data: { cerradas: toClose.length },
    });
  } catch (error) {
    console.error("[CRON] cerrar-en-curso error:", error);
    return NextResponse.json(
      { success: false, error: "Error interno" },
      { status: 500 },
    );
  }
}
