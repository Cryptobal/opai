import { prisma } from "@/lib/prisma";
import type { DimensionResult } from "../types";

export async function calcularScoreRondas(
  guardiaId: string,
  tenantId: string,
  fechaInicio: Date,
  fechaFin: Date,
): Promise<DimensionResult> {
  const ejecuciones = await prisma.opsRondaEjecucion.findMany({
    where: {
      tenantId,
      guardiaId,
      isAdHoc: false,
      scheduledAt: { gte: fechaInicio, lte: fechaFin },
    },
    select: { status: true, trustScore: true },
  });

  if (ejecuciones.length === 0) {
    return { score: -1, detalle: { sinDatos: true } };
  }

  const rondasProgramadas = ejecuciones.length;
  const rondasCompletadas = ejecuciones.filter(
    (e) => e.status === "completada" || e.status === "incompleta",
  ).length;
  const rondasPerfectas = ejecuciones.filter(
    (e) => e.status === "completada" && e.trustScore >= 90,
  ).length;

  const trustScoresCompletadas = ejecuciones
    .filter((e) => e.status === "completada" || e.status === "incompleta")
    .map((e) => e.trustScore);

  const promedioTrustScore =
    trustScoresCompletadas.length > 0
      ? trustScoresCompletadas.reduce((a, b) => a + b, 0) / trustScoresCompletadas.length
      : 0;

  const tasaCompletitud = rondasCompletadas / rondasProgramadas;

  const incidentesCount = await prisma.opsRondaIncidente.count({
    where: {
      tenantId,
      guardiaId,
      createdAt: { gte: fechaInicio, lte: fechaFin },
    },
  });

  const bonusIncidentes = Math.min(incidentesCount * 0.02, 0.1);
  const score = Math.min(100, Math.max(0, Math.round(
    (tasaCompletitud * 0.5 + (promedioTrustScore / 100) * 0.4 + bonusIncidentes) * 100,
  )));

  return {
    score,
    detalle: {
      rondasProgramadas,
      rondasCompletadas,
      rondasPerfectas,
      promedioTrustScore: Math.round(promedioTrustScore * 10) / 10,
      tasaCompletitud: Math.round(tasaCompletitud * 100),
      incidentesReportados: incidentesCount,
    },
  };
}
