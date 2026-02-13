import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseBody } from "@/lib/api-auth";
import { rondaCompleteSchema } from "@/lib/validations/rondas";
import { computeRondaTrustScore } from "@/lib/rondas/trust-score";

export async function POST(request: NextRequest) {
  try {
    const parsed = await parseBody(request, rondaCompleteSchema);
    if (parsed.error) return parsed.error;

    const execution = await prisma.opsRondaEjecucion.findFirst({
      where: { id: parsed.data.executionId, status: { in: ["pendiente", "en_curso", "incompleta"] } },
      include: {
        rondaTemplate: { include: { checkpoints: true } },
        marcaciones: { orderBy: { timestamp: "asc" } },
      },
    });
    if (!execution) return NextResponse.json({ success: false, error: "Ejecución no encontrada" }, { status: 404 });

    const total = execution.rondaTemplate.checkpoints.length;
    const completed = execution.marcaciones.length;
    const pct = total > 0 ? (completed / total) * 100 : 0;

    const scores = execution.marcaciones.map((m) => {
      const anomalies = (m.anomalias as string[] | null) ?? [];
      return Math.max(0, 100 - anomalies.length * 20);
    });
    const trustScore = computeRondaTrustScore(scores);
    const status = completed >= total ? "completada" : "incompleta";

    const updated = await prisma.opsRondaEjecucion.update({
      where: { id: execution.id },
      data: {
        status,
        completedAt: new Date(),
        checkpointsTotal: total,
        checkpointsCompletados: completed,
        porcentajeCompletado: pct,
        trustScore,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        status: updated.status,
        trustScore: updated.trustScore,
        porcentajeCompletado: updated.porcentajeCompletado,
      },
    });
  } catch (error) {
    console.error("[RONDAS] public completar", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
