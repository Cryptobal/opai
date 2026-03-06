import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { formatChileTime } from "@/lib/rondas/timezone";

/**
 * CRON: /api/cron/rondas/cerrar-atrasadas
 *
 * Closes pending rondas that were never started and whose grace window has passed.
 * Runs every 30 minutes via Vercel Cron.
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
    // We fetch those scheduled more than 30 minutes ago (minimum grace),
    // then apply per-programacion tolerance in JS.
    const cutoffMin = new Date(now.getTime() - 60 * 60 * 1000); // 60 min ago as safe lower bound
    const pendingEjecuciones = await prisma.opsRondaEjecucion.findMany({
      where: {
        status: "pendiente",
        startedAt: null,
        scheduledAt: { lte: cutoffMin },
      },
      include: {
        programacion: { select: { toleranciaMinutos: true } },
        rondaTemplate: { select: { name: true, installationId: true } },
      },
      take: 500,
    });

    if (pendingEjecuciones.length === 0) {
      return NextResponse.json({ success: true, data: { cerradas: 0, fecha: now.toISOString() } });
    }

    // Filter: only close if scheduledAt + tolerancia + 30 min has passed
    const toClose = pendingEjecuciones.filter((ej) => {
      const toleranciaMin = ej.programacion?.toleranciaMinutos ?? 30;
      const graceMs = (toleranciaMin + 30) * 60 * 1000;
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

    // Create warning alerts for each
    const alertData = toClose.map((ej) => ({
      tenantId: ej.tenantId,
      ejecucionId: ej.id,
      installationId: ej.rondaTemplate.installationId,
      tipo: "ronda_no_realizada",
      severidad: "warning",
      mensaje: `Ronda "${ej.rondaTemplate.name}" de las ${formatChileTime(ej.scheduledAt)} no fue realizada`,
      data: {
        scheduledAt: ej.scheduledAt.toISOString(),
        closedAt: now.toISOString(),
        closedBy: "system_cron",
      } as never,
    }));

    if (alertData.length > 0) {
      await prisma.opsAlertaRonda.createMany({ data: alertData });
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
