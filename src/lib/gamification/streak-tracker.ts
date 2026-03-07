import { prisma } from "@/lib/prisma";

const UMBRAL_PERFECTO = 80;

export async function calcularRachaActual(
  guardiaId: string,
  tenantId: string,
  hasta: Date,
): Promise<{ rachaActual: number; mejorRachaHistorica: number }> {
  const desde = new Date(hasta);
  desde.setDate(desde.getDate() - 120);

  const scoresDiarios = await prisma.gamificacionScoreGuardia.findMany({
    where: {
      guardiaId,
      tenantId,
      periodoTipo: "diario",
      fechaInicio: { gte: desde, lte: hasta },
    },
    select: { fechaInicio: true, trustScore: true },
    orderBy: { fechaInicio: "desc" },
  });

  let rachaActual = 0;
  for (const score of scoresDiarios) {
    if (score.trustScore >= UMBRAL_PERFECTO) {
      rachaActual++;
    } else {
      break;
    }
  }

  let mejorRacha = 0;
  let rachaTemp = 0;
  const cronologico = [...scoresDiarios].reverse();
  for (const score of cronologico) {
    if (score.trustScore >= UMBRAL_PERFECTO) {
      rachaTemp++;
      mejorRacha = Math.max(mejorRacha, rachaTemp);
    } else {
      rachaTemp = 0;
    }
  }

  return { rachaActual, mejorRachaHistorica: Math.max(mejorRacha, rachaActual) };
}
