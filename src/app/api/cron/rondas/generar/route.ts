import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildScheduleSlots } from "@/lib/rondas/schedule-engine";
import { pendingProgramadaEjecucion } from "@/lib/rondas/pending-programada-ejecucion";
import { startOfDayChile } from "@/lib/rondas/timezone";

/**
 * CRON: /api/cron/rondas/generar
 *
 * Genera ejecuciones de rondas desde el inicio del día Chile hasta +24h.
 * Runs every 10 minutes via Vercel Cron.
 * Protected with CRON_SECRET env var.
 */
export async function GET(request: NextRequest) {
  try {
    // Validate cron secret
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
    // Generate from start of YESTERDAY (Chile time) to capture overnight shifts
    // that cross midnight (e.g., 22:00 Fri → 06:00 Sat produces Sat 01:00+ slots)
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const from = startOfDayChile(yesterday);
    const end = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const programaciones = await prisma.opsRondaProgramacion.findMany({
      where: { isActive: true },
      include: {
        rondaTemplate: {
          include: { checkpoints: true },
        },
      },
    });

    // Pre-load existing executions for the entire time range to avoid N+1 queries
    const existingEjecuciones = await prisma.opsRondaEjecucion.findMany({
      where: {
        scheduledAt: { gte: from, lte: end },
        programacionId: { in: programaciones.map((p) => p.id) },
      },
      select: { programacionId: true, scheduledAt: true },
    });

    // Build a Set of "programacionId|scheduledAt" for fast dedup lookup
    const existingKeys = new Set(
      existingEjecuciones.map(
        (e) => `${e.programacionId}|${e.scheduledAt.toISOString()}`,
      ),
    );

    let generated = 0;
    for (const p of programaciones) {
      const slots = buildScheduleSlots({
        from,
        to: end,
        diasSemana: (p.diasSemana as number[]) ?? [],
        horaInicio: p.horaInicio,
        horaFin: p.horaFin,
        frecuenciaMinutos: p.frecuenciaMinutos,
      });

      // Filter out slots that already have executions
      const newSlots = slots.filter(
        (slot) => !existingKeys.has(`${p.id}|${slot.toISOString()}`),
      );
      if (newSlots.length === 0) continue;

      const rows = newSlots.map((scheduledAt) =>
        pendingProgramadaEjecucion({
          tenantId: p.tenantId,
          rondaTemplateId: p.rondaTemplateId,
          programacionId: p.id,
          scheduledAt,
          checkpointsTotal: p.rondaTemplate!.checkpoints.length,
        }),
      );

      const result = await prisma.opsRondaEjecucion.createMany({
        data: rows,
        skipDuplicates: true,
      });
      generated += result.count;
    }

    return NextResponse.json({ success: true, data: { generated } });
  } catch (error) {
    console.error("[CRON] rondas generar", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
