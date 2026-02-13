import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildScheduleSlots } from "@/lib/rondas/schedule-engine";

/**
 * Genera ejecuciones de rondas para las próximas 24h.
 * Diseñado para Vercel Cron.
 */
export async function GET() {
  try {
    const now = new Date();
    const end = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const programaciones = await prisma.opsRondaProgramacion.findMany({
      where: { isActive: true },
      include: {
        rondaTemplate: {
          include: { checkpoints: true },
        },
      },
    });

    let generated = 0;
    for (const p of programaciones) {
      const slots = buildScheduleSlots({
        from: now,
        to: end,
        diasSemana: (p.diasSemana as number[]) ?? [],
        horaInicio: p.horaInicio,
        horaFin: p.horaFin,
        frecuenciaMinutos: p.frecuenciaMinutos,
      });

      for (const scheduledAt of slots) {
        const exists = await prisma.opsRondaEjecucion.findFirst({
          where: {
            tenantId: p.tenantId,
            rondaTemplateId: p.rondaTemplateId,
            programacionId: p.id,
            scheduledAt,
          },
          select: { id: true },
        });
        if (exists) continue;

        await prisma.opsRondaEjecucion.create({
          data: {
            tenantId: p.tenantId,
            rondaTemplateId: p.rondaTemplateId,
            programacionId: p.id,
            status: "pendiente",
            scheduledAt,
            checkpointsTotal: p.rondaTemplate.checkpoints.length,
          },
        });
        generated += 1;
      }
    }

    return NextResponse.json({ success: true, data: { generated } });
  } catch (error) {
    console.error("[CRON] rondas generar", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
