import { prisma } from "@/lib/prisma";
import type { DimensionResult } from "../types";

export async function calcularScoreCapacitacion(
  guardiaId: string,
  _tenantId: string,
  fechaInicio: Date,
  fechaFin: Date,
): Promise<DimensionResult> {
  const examenes = await prisma.examAssignment.findMany({
    where: {
      guardId: guardiaId,
      status: "completed",
      completedAt: { gte: fechaInicio, lte: fechaFin },
    },
    select: { score: true },
  });

  if (examenes.length === 0) {
    return { score: -1, detalle: { sinDatos: true } };
  }

  const scores = examenes.map((e) => e.score ?? 0);
  const promedioScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  const aprobados = scores.filter((s) => s >= 60).length;
  const tasaAprobacion = aprobados / examenes.length;

  const score = Math.min(100, Math.max(0, Math.round(
    promedioScore * 0.6 + tasaAprobacion * 100 * 0.4,
  )));

  return {
    score,
    detalle: {
      examenesCompletados: examenes.length,
      promedioScore: Math.round(promedioScore * 10) / 10,
      aprobados,
      tasaAprobacion: Math.round(tasaAprobacion * 100),
    },
  };
}
