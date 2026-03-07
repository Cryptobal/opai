import { prisma } from "@/lib/prisma";
import type { DimensionResult } from "../types";

export async function calcularScoreSupervision(
  guardiaId: string,
  tenantId: string,
  fechaInicio: Date,
  fechaFin: Date,
): Promise<DimensionResult> {
  const evaluaciones = await prisma.opsSupervisionGuardEvaluation.findMany({
    where: {
      tenantId,
      guardId: guardiaId,
      createdAt: { gte: fechaInicio, lte: fechaFin },
    },
    select: {
      presentationScore: true,
      orderScore: true,
      protocolScore: true,
    },
  });

  if (evaluaciones.length === 0) {
    return { score: -1, detalle: { sinDatos: true } };
  }

  const maxScore = 5;
  const avgPresentation = evaluaciones.reduce((s, e) => s + (e.presentationScore ?? 0), 0) / evaluaciones.length;
  const avgOrder = evaluaciones.reduce((s, e) => s + (e.orderScore ?? 0), 0) / evaluaciones.length;
  const avgProtocol = evaluaciones.reduce((s, e) => s + (e.protocolScore ?? 0), 0) / evaluaciones.length;

  const promedioNormalizado = ((avgPresentation + avgOrder + avgProtocol) / 3 / maxScore) * 100;

  const hallazgosNegativos = await prisma.opsSupervisionFinding.count({
    where: {
      tenantId,
      guardId: guardiaId,
      status: "open",
      createdAt: { gte: fechaInicio, lte: fechaFin },
    },
  });

  const penalHallazgos = hallazgosNegativos * 5;
  const score = Math.min(100, Math.max(0, Math.round(promedioNormalizado - penalHallazgos)));

  return {
    score,
    detalle: {
      evaluaciones: evaluaciones.length,
      promedioPresentation: Math.round(avgPresentation * 10) / 10,
      promedioOrder: Math.round(avgOrder * 10) / 10,
      promedioProtocol: Math.round(avgProtocol * 10) / 10,
      hallazgosNegativos,
    },
  };
}
