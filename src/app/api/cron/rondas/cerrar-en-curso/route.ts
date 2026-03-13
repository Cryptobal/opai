import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPusherServer } from "@/lib/chat";
import { getActiveTurnoId } from "@/lib/rondas/get-active-turno";
import { notifyCriticalAlertsBatch } from "@/lib/rondas/alert-notifications";

/**
 * CRON: /api/cron/rondas/cerrar-en-curso
 *
 * Auto-closes SCHEDULED (non ad-hoc) rondas that are still "en_curso"
 * after exceeding the configurable maximum duration.
 *
 * Timeout resolution:
 *   1. CrmInstallation.maxRondaDurationMinutes (per-installation override)
 *   2. Tenant.defaultMaxRondaDurationMinutes (tenant-level fallback, default 120)
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
      where: { isAdHoc: false, status: "en_curso", startedAt: { not: null } },
      select: {
        id: true,
        tenantId: true,
        installationId: true,
        guardiaId: true,
        startedAt: true,
        installation: {
          select: { maxRondaDurationMinutes: true },
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

    // Fetch tenant-level defaults for fallback
    const tenantIds = [...new Set(enCurso.map((ej) => ej.tenantId))];
    const tenants = await prisma.tenant.findMany({
      where: { id: { in: tenantIds } },
      select: { id: true, defaultMaxRondaDurationMinutes: true },
    });
    const tenantDefaults = new Map(
      tenants.map((t) => [t.id, t.defaultMaxRondaDurationMinutes]),
    );

    // Determine which rondas exceeded their timeout
    const toClose: typeof enCurso = [];

    for (const ej of enCurso) {
      if (!ej.startedAt) continue;

      const maxMinutes =
        ej.installation?.maxRondaDurationMinutes ??
        tenantDefaults.get(ej.tenantId) ??
        120;

      const cutoff = new Date(now.getTime() - maxMinutes * 60 * 1000);
      if (ej.startedAt <= cutoff) {
        toClose.push(ej);
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
        penalizacionMotivo: "Cierre automático por exceder tiempo máximo",
        trustBreakdown: {
          reason: "auto_closed_exceeded_max_duration",
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
        const maxMinutes =
          ej.installation?.maxRondaDurationMinutes ??
          tenantDefaults.get(ej.tenantId) ??
          120;
        return {
          tenantId: ej.tenantId,
          ejecucionId: ej.id,
          installationId: ej.installationId!,
          guardiaId: ej.guardiaId,
          turnoId: turnoMap.get(ej.tenantId) ?? null,
          tipo: "ronda_en_curso_timeout",
          severidad: "warning",
          mensaje: `Ronda programada cerrada automáticamente: excedió ${maxMinutes} minutos de duración`,
          data: {
            closedAt: now.toISOString(),
            closedBy: "system_cron",
            reason: "exceeded_max_duration",
            maxMinutes,
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

    console.log(
      `[CRON] cerrar-en-curso: ${toClose.length} rondas programadas cerradas por exceder duración máxima`,
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
