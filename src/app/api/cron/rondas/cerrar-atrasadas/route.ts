import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { formatChileTime } from "@/lib/rondas/timezone";
import { getActiveTurnoId } from "@/lib/rondas/get-active-turno";
import { notifyCriticalAlertsBatch } from "@/lib/rondas/alert-notifications";
import { emitRondasNoRealizadas } from "@/lib/rondas/lifecycle-notifications";

/**
 * CRON: /api/cron/rondas/cerrar-atrasadas
 *
 * Closes pending rondas that were never started and whose grace window has passed.
 * Grace window = frecuenciaMinutos ÷ 2 (half the time between rounds).
 * Falls back to toleranciaMinutos if explicitly set, otherwise 20 min if no frequency.
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

    // Find all pending executions that were never started.
    // We fetch those scheduled more than 10 minutes ago (minimum grace),
    // then apply per-programacion tolerance in JS.
    const cutoffMin = new Date(now.getTime() - 10 * 60 * 1000); // 10 min ago as safe lower bound
    const pendingEjecuciones = await prisma.opsRondaEjecucion.findMany({
      where: {
        status: "pendiente",
        startedAt: null,
        scheduledAt: { lte: cutoffMin },
      },
      include: {
        programacion: { select: { toleranciaMinutos: true, frecuenciaMinutos: true } },
        rondaTemplate: { select: { name: true, installationId: true } },
      },
      take: 500,
    });

    if (pendingEjecuciones.length === 0) {
      return NextResponse.json({ success: true, data: { cerradas: 0, fecha: now.toISOString() } });
    }

    // Filter: close once scheduledAt + grace has passed.
    // Grace = frecuenciaMinutos ÷ 2 (smart), or toleranciaMinutos if explicitly configured,
    // fallback to 20 min when no frequency or programacion is available.
    const toClose = pendingEjecuciones.filter((ej) => {
      const frecuencia = ej.programacion?.frecuenciaMinutos;
      const tolerancia = ej.programacion?.toleranciaMinutos;
      const graceMin = tolerancia != null
        ? tolerancia
        : frecuencia != null
          ? Math.round(frecuencia / 2)
          : 20;
      const graceMs = graceMin * 60 * 1000;
      return ej.scheduledAt.getTime() + graceMs < now.getTime();
    });

    if (toClose.length === 0) {
      return NextResponse.json({ success: true, data: { cerradas: 0, fecha: now.toISOString() } });
    }

    const ids = toClose.map((ej) => ej.id);

    // Batch update all to no_realizada
    await prisma.opsRondaEjecucion.updateMany({
      where: { id: { in: ids } },
      data: {
        status: "no_realizada",
        completedAt: now,
        trustScore: 0,
        trustBreakdown: {
          reason: "auto_closed_not_performed",
          closedBy: "system_cron",
        },
      },
    });

    // Create warning alerts for each (skip ad-hoc rondas without template)
    // Batch-lookup turnoId per tenant
    const uniqueTenants = [...new Set(toClose.map((ej) => ej.tenantId))];
    const turnoMap = new Map<string, string | null>();
    await Promise.all(uniqueTenants.map(async (tid) => {
      turnoMap.set(tid, await getActiveTurnoId(tid));
    }));

    const alertData = toClose.filter((ej) => ej.rondaTemplate).map((ej) => ({
      tenantId: ej.tenantId,
      ejecucionId: ej.id,
      installationId: ej.rondaTemplate!.installationId,
      turnoId: turnoMap.get(ej.tenantId) ?? null,
      tipo: "ronda_no_realizada",
      severidad: "warning",
      mensaje: `Ronda "${ej.rondaTemplate!.name}" de las ${formatChileTime(ej.scheduledAt)} no fue realizada`,
      data: {
        scheduledAt: ej.scheduledAt.toISOString(),
        closedAt: now.toISOString(),
        closedBy: "system_cron",
      } as never,
    }));

    if (alertData.length > 0) {
      await prisma.opsAlertaRonda.createMany({ data: alertData });

      // Push + chat notification for critical alerts per tenant (fire-and-forget)
      for (const tid of uniqueTenants) {
        const tenantAlerts = alertData.filter((a) => a.tenantId === tid);
        if (tenantAlerts.length > 0) {
          notifyCriticalAlertsBatch(tid, tenantAlerts).catch((err) =>
            console.error("[CRON] cerrar-atrasadas notification failed:", err),
          );
        }
      }
    }

    // Fase 19: tarjeta individual de atención por cada ronda no realizada
    for (const tid of uniqueTenants) {
      const tenantIds = toClose.filter((ej) => ej.tenantId === tid).map((ej) => ej.id);
      await emitRondasNoRealizadas(tid, tenantIds);
    }

    console.log(`[CRON] cerrar-atrasadas: ${toClose.length} rondas cerradas como no_realizada`);

    return NextResponse.json({
      success: true,
      data: { cerradas: toClose.length, fecha: now.toISOString() },
    });
  } catch (error) {
    console.error("[CRON] cerrar-atrasadas error:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
