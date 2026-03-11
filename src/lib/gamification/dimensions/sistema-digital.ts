import { prisma } from "@/lib/prisma";
import type { DimensionResult } from "../types";

export async function calcularScoreSistemaDigital(
  guardiaId: string,
  tenantId: string,
  fechaInicio: Date,
  fechaFin: Date,
): Promise<DimensionResult> {
  const marcacionesDigitales = await prisma.opsMarcacion.count({
    where: {
      tenantId,
      guardiaId,
      timestamp: { gte: fechaInicio, lte: fechaFin },
      metodoId: { in: ["rut_pin", "qr", "facial"] },
      deletedAt: null,
    },
  });

  const asistenciasConCheckin = await prisma.opsAsistenciaDiaria.count({
    where: {
      OR: [{ actualGuardiaId: guardiaId }, { plannedGuardiaId: guardiaId }],
      date: { gte: fechaInicio, lte: fechaFin },
      checkInAt: { not: null },
    },
  });

  const marcacionesTotales = asistenciasConCheckin * 2;

  if (marcacionesTotales === 0) {
    return { score: -1, detalle: { sinDatos: true } };
  }

  const tasaDigital = Math.min(1, marcacionesDigitales / marcacionesTotales);
  const bonusConsistencia = tasaDigital >= 0.95 ? 0.1 : 0;

  const score = Math.min(100, Math.max(0, Math.round(
    (tasaDigital + bonusConsistencia) * 100,
  )));

  return {
    score,
    detalle: {
      marcacionesDigitales,
      marcacionesTotales,
      tasaDigital: Math.round(tasaDigital * 100),
      bonusConsistencia: bonusConsistencia > 0,
    },
  };
}
