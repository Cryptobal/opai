/**
 * Configuración de jornada laboral (Ley 21.561 — 42 horas)
 * Lee los límites vigentes desde ConfigJornada en vez de hardcodear.
 *
 * SERVER-ONLY (usa Prisma). El cálculo puro reutilizable en cliente vive en
 * `jornada-calc.ts`; acá sólo se re-exporta para no romper imports existentes.
 */

import { prisma } from "@/lib/prisma";
import { DEFAULT_LIMITS, type JornadaLimits } from "./jornada-calc";

export type { JornadaLimits };
export {
  DEFAULT_LIMITS,
  MAX_HORAS_DIARIA_ORDINARIA,
  analizarJornada,
  calcularPromedioSemanal,
  durHoras,
} from "./jornada-calc";
export type {
  JornadaAnalysis,
  JornadaAlerta,
  Regimen,
  CicloPromedioResult,
  AnalizarJornadaInput,
} from "./jornada-calc";

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
