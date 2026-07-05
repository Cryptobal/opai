import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPusherServer } from "@/lib/chat";
import { getActiveTurnoId } from "@/lib/rondas/get-active-turno";
import { notifyCriticalAlertsBatch } from "@/lib/rondas/alert-notifications";
import { emitRondasTerminadas } from "@/lib/rondas/lifecycle-notifications";
import { onlyActiveInstallationEjecucion } from "@/lib/rondas/active-installation-filter";

/**
 * CRON: /api/cron/rondas/cerrar-libres
 *
 * Auto-closes free (ad-hoc) rondas that have exceeded the maximum duration
 * or have lost GPS signal for too long.
 * Runs every hour via Vercel Cron.
 * Protected with CRON_SECRET env var.
 */

const FREE_ROUND_MAX_DURATION_MINUTES = 120;
const NO_SIGNAL_CLOSE_MINUTES = 30;

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
    const timeoutCutoff = new Date(
      now.getTime() - FREE_ROUND_MAX_DURATION_MINUTES * 60 * 1000,
    );
    const noSignalCutoff = new Date(
      now.getTime() - NO_SIGNAL_CLOSE_MINUTES * 60 * 1000,
    );

    // Query all ad-hoc rondas currently en_curso
    const enCurso = await prisma.opsRondaEjecucion.findMany({
      where: {
        isAdHoc: true,
        status: "en_curso",
        ...onlyActiveInstallationEjecucion,
      },
      select: {
        id: true,
        tenantId: true,
        installationId: true,
        guardiaId: true,
        startedAt: true,
        trackingPoints: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { createdAt: true },
        },
      },
      take: 500,
    });

    if (enCurso.length === 0) {
      return NextResponse.json({
        success: true,
        data: { cerradas: 0, reasons: { timeout: 0, no_signal: 0 } },
      });
    }

    // Classify each ronda by close reason
    const toCloseTimeout: typeof enCurso = [];
    const toCloseNoSignal: typeof enCurso = [];

    for (const ej of enCurso) {
      if (!ej.startedAt) continue;

      if (ej.startedAt <= timeoutCutoff) {
        toCloseTimeout.push(ej);
      } else {
        const lastPoint = ej.trackingPoints[0];
        if (lastPoint && lastPoint.createdAt <= noSignalCutoff) {
          toCloseNoSignal.push(ej);
        }
      }
    }

    const allToClose = [...toCloseTimeout, ...toCloseNoSignal];

    if (allToClose.length === 0) {
      return NextResponse.json({
        success: true,
        data: { cerradas: 0, reasons: { timeout: 0, no_signal: 0 } },
      });
    }

    const allIds = allToClose.map((ej) => ej.id);

    // Batch update all to cerrada_auto
    await prisma.opsRondaEjecucion.updateMany({
      where: { id: { in: allIds } },
      data: {
        status: "cerrada_auto",
        completedAt: now,
        trustScore: 0,
        trustBreakdown: {
          reason: "auto_closed_free_round",
          closedBy: "system_cron",
          closedAt: now.toISOString(),
        } as never,
      },
    });

    // Create alerts for each ronda (skip those without installationId)
    // Batch-lookup turnoId per tenant
    const alertTenantIds = [...new Set(allToClose.map((ej) => ej.tenantId))];
    const turnoMap = new Map<string, string | null>();
    await Promise.all(alertTenantIds.map(async (tid) => {
      turnoMap.set(tid, await getActiveTurnoId(tid));
    }));

    const alertData = allToClose.filter((ej) => ej.installationId).map((ej) => {
      const isTimeout = toCloseTimeout.some((t) => t.id === ej.id);
      return {
        tenantId: ej.tenantId,
        ejecucionId: ej.id,
        installationId: ej.installationId!,
        turnoId: turnoMap.get(ej.tenantId) ?? null,
        tipo: "ronda_libre_timeout",
        severidad: "warning",
        mensaje: isTimeout
          ? `Ronda libre cerrada automáticamente: excedió ${FREE_ROUND_MAX_DURATION_MINUTES} minutos de duración`
          : `Ronda libre cerrada automáticamente: sin señal GPS por más de ${NO_SIGNAL_CLOSE_MINUTES} minutos`,
        data: {
          closedAt: now.toISOString(),
          closedBy: "system_cron",
          reason: isTimeout ? "timeout" : "no_signal",
        } as never,
      };
    });

    if (alertData.length > 0) {
      await prisma.opsAlertaRonda.createMany({ data: alertData });

      // Push + chat notification for critical alerts per tenant (fire-and-forget)
      for (const tid of alertTenantIds) {
        const tenantAlerts = alertData.filter((a) => a.tenantId === tid);
        if (tenantAlerts.length > 0) {
          notifyCriticalAlertsBatch(tid, tenantAlerts).catch((err) =>
            console.error("[CRON] cerrar-libres notification failed:", err),
          );
        }
      }
    }

    // Notify each unique tenant's monitoring dashboard via Pusher
    const uniqueTenantIds = [...new Set(allToClose.map((ej) => ej.tenantId))];
    try {
      const pusher = getPusherServer();
      await Promise.all(
        uniqueTenantIds.map((tenantId) =>
          pusher.trigger(`monitoreo-${tenantId}`, "ronda-completed", {
            bulkClose: true,
            count: allIds.length,
            ids: allToClose
              .filter((ej) => ej.tenantId === tenantId)
              .map((ej) => ej.id),
          }),
        ),
      );
    } catch (pusherErr) {
      console.error("[CRON] cerrar-libres Pusher trigger failed:", pusherErr);
    }

    // Fase 19: tarjeta ⚠️ de cierre automático por cada ronda (reply del hilo si existe)
    for (const tid of uniqueTenantIds) {
      const ids = allToClose.filter((ej) => ej.tenantId === tid).map((ej) => ej.id);
      await emitRondasTerminadas(tid, ids);
    }

    console.log(
      `[CRON] cerrar-libres: ${allToClose.length} rondas cerradas (timeout: ${toCloseTimeout.length}, no_signal: ${toCloseNoSignal.length})`,
    );

    return NextResponse.json({
      success: true,
      data: {
        cerradas: allToClose.length,
        reasons: {
          timeout: toCloseTimeout.length,
          no_signal: toCloseNoSignal.length,
        },
      },
    });
  } catch (error) {
    console.error("[CRON] cerrar-libres error:", error);
    return NextResponse.json(
      { success: false, error: "Error interno" },
      { status: 500 },
    );
  }
}
