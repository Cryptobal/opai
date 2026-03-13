/**
 * Configuración de jornada laboral (Ley 21.561 — 42 horas)
 * Lee los límites vigentes desde ConfigJornada en vez de hardcodear.
 */

import { prisma } from "@/lib/prisma";

export interface JornadaLimits {
  maxHorasSemanales: number;
  maxHorasDiarias: number;
  maxHorasExtras: number;
  leyReferencia: string | null;
}

const DEFAULT_LIMITS: JornadaLimits = {
  maxHorasSemanales: 42,
  maxHorasDiarias: 12,
  maxHorasExtras: 2,
  leyReferencia: "Ley 21.561",
};

export async function getJornadaLimits(
  tenantId: string,
  fecha?: Date
): Promise<JornadaLimits> {
  const targetDate = fecha ?? new Date();

  const config = await prisma.configJornada.findFirst({
    where: {
      tenantId,
      vigenciaDesde: { lte: targetDate },
      OR: [
        { vigenciaHasta: null },
        { vigenciaHasta: { gte: targetDate } },
      ],
    },
    orderBy: { vigenciaDesde: "desc" },
  });

  if (!config) return DEFAULT_LIMITS;

  return {
    maxHorasSemanales: config.maxHorasSemanales,
    maxHorasDiarias: config.maxHorasDiarias,
    maxHorasExtras: config.maxHorasExtras,
    leyReferencia: config.leyReferencia,
  };
}

export interface CicloPromedioResult {
  promedio: number;
  cumple: boolean;
  exceso: number;
  horasTotales: number;
  semanasCiclo: number;
}

/**
 * Calcula el promedio semanal para jornada excepcional (Art. 22 bis).
 * Para ciclos como 4x4, 5x5, etc., el promedio se calcula sobre
 * el ciclo completo: horasTotales / semanasCiclo ≤ maxHorasSemanales
 */
export function calcularPromedioSemanal(
  horasPorDia: number[],
  ciclo: { diasTrabajo: number; diasDescanso: number },
  maxHorasSemanales: number
): CicloPromedioResult {
  const diasCiclo = ciclo.diasTrabajo + ciclo.diasDescanso;
  const semanasCiclo = diasCiclo / 7;
  const horasTotales = horasPorDia.reduce((sum, h) => sum + h, 0);
  const promedio = semanasCiclo > 0 ? horasTotales / semanasCiclo : 0;
  const exceso = Math.max(0, promedio - maxHorasSemanales);

  return {
    promedio: Math.round(promedio * 100) / 100,
    cumple: promedio <= maxHorasSemanales,
    exceso: Math.round(exceso * 100) / 100,
    horasTotales: Math.round(horasTotales * 100) / 100,
    semanasCiclo: Math.round(semanasCiclo * 100) / 100,
  };
}
