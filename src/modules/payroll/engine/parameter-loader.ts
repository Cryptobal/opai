/**
 * PARAMETER LOADER
 * Carga parámetros legales y resuelve referencias UF/UTM desde schema fx
 */

import { prisma } from "@/lib/prisma";
import type { PayrollParameters, FxReferences, ParametersSnapshot } from "./types";

/**
 * Cargar versión activa de parámetros
 */
export async function loadActiveParameters(): Promise<{
  id: string;
  data: PayrollParameters;
  effectiveFrom: Date;
  effectiveUntil: Date | null;
}> {
  const activeVersion = await prisma.payrollParameterVersion.findFirst({
    where: { isActive: true },
  });

  if (!activeVersion) {
    throw new Error("No active parameter version found");
  }

  return {
    id: activeVersion.id,
    data: activeVersion.data as unknown as PayrollParameters,
    effectiveFrom: activeVersion.effectiveFrom,
    effectiveUntil: activeVersion.effectiveUntil,
  };
}

/**
 * Cargar versión específica de parámetros por ID
 */
export async function loadParametersById(versionId: string): Promise<{
  id: string;
  data: PayrollParameters;
  effectiveFrom: Date;
  effectiveUntil: Date | null;
}> {
  const version = await prisma.payrollParameterVersion.findUnique({
    where: { id: versionId },
  });

  if (!version) {
    throw new Error(`Parameter version ${versionId} not found`);
  }

  return {
    id: version.id,
    data: version.data as unknown as PayrollParameters,
    effectiveFrom: version.effectiveFrom,
    effectiveUntil: version.effectiveUntil,
  };
}

/**
 * Cargar versión vigente en una fecha específica
 */
export async function loadParametersByDate(date: Date): Promise<{
  id: string;
  data: PayrollParameters;
  effectiveFrom: Date;
  effectiveUntil: Date | null;
}> {
  const version = await prisma.payrollParameterVersion.findFirst({
    where: {
      effectiveFrom: { lte: date },
      OR: [
        { effectiveUntil: null },
        { effectiveUntil: { gte: date } },
      ],
    },
    orderBy: { effectiveFrom: "desc" },
  });

  if (!version) {
    throw new Error(`No parameter version found for date ${date.toISOString()}`);
  }

  return {
    id: version.id,
    data: version.data as unknown as PayrollParameters,
    effectiveFrom: version.effectiveFrom,
    effectiveUntil: version.effectiveUntil,
  };
}

/**
 * Resolver valor UF para una fecha específica
 */
export async function resolveUfValue(date?: string): Promise<{
  value: number;
  date: string;
}> {
  const targetDate = date ? new Date(date) : new Date();
  
  const ufRate = await prisma.fxUfRate.findFirst({
    where: { date: targetDate },
  });

  if (!ufRate) {
    // Buscar el valor más cercano anterior
    const closestUf = await prisma.fxUfRate.findFirst({
      where: { date: { lte: targetDate } },
      orderBy: { date: "desc" },
    });

    if (!closestUf) {
      throw new Error(`No UF value found for date ${targetDate.toISOString()}`);
    }

    return {
      value: Number(closestUf.value),
      date: closestUf.date.toISOString().split("T")[0],
    };
  }

  return {
    value: Number(ufRate.value),
    date: ufRate.date.toISOString().split("T")[0],
  };
}

/**
 * Resolver valor UTM para un mes específico
 */
export async function resolveUtmValue(month?: string): Promise<{
  value: number;
  month: string;
}> {
  // Si no se especifica, usar el mes actual
  const targetMonth = month
    ? new Date(month)
    : new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  const utmRate = await prisma.fxUtmRate.findFirst({
    where: { month: targetMonth },
  });

  if (!utmRate) {
    // Buscar el valor más cercano anterior
    const closestUtm = await prisma.fxUtmRate.findFirst({
      where: { month: { lte: targetMonth } },
      orderBy: { month: "desc" },
    });

    if (!closestUtm) {
      throw new Error(`No UTM value found for month ${targetMonth.toISOString()}`);
    }

    return {
      value: Number(closestUtm.value),
      month: closestUtm.month.toISOString().split("T")[0],
    };
  }

  return {
    value: Number(utmRate.value),
    month: utmRate.month.toISOString().split("T")[0],
  };
}

/**
 * Resolver todas las referencias FX (UF, UTM, IMM)
 * @param imm_from_params - IMM desde params.imm.value_clp (fuente autoritativa)
 */
export async function resolveFxReferences(
  uf_value?: number,
  uf_date?: string,
  utm_value?: number,
  utm_month?: string,
  imm_from_params?: number
): Promise<FxReferences> {
  let ufData: { value: number; date: string };
  let utmData: { value: number; month: string };

  // Si se proveen valores, usarlos directamente
  if (uf_value && uf_date) {
    ufData = { value: uf_value, date: uf_date };
  } else {
    ufData = await resolveUfValue(uf_date);
  }

  if (utm_value && utm_month) {
    utmData = { value: utm_value, month: utm_month };
  } else {
    utmData = await resolveUtmValue(utm_month);
  }

  // IMM: usar el valor de los parámetros legales (fuente autoritativa)
  // Fallback a 500.000 solo si no se provee (no debería ocurrir)
  const imm_clp = imm_from_params || 500000;

  return {
    uf_clp: ufData.value,
    uf_date: ufData.date,
    utm_clp: utmData.value,
    utm_month: utmData.month,
    imm_clp,
  };
}

/**
 * Crear snapshot completo de parámetros + referencias
 */
export function createParametersSnapshot(
  versionId: string,
  versionName: string,
  effectiveFrom: Date,
  effectiveUntil: Date | null,
  parameters: PayrollParameters,
  references: FxReferences
): ParametersSnapshot {
  return {
    version_id: versionId,
    effective_from: effectiveFrom.toISOString().split("T")[0],
    effective_until: effectiveUntil?.toISOString().split("T")[0] || null,
    name: versionName,

    references_at_calculation: {
      uf_clp: references.uf_clp,
      uf_date: references.uf_date,
      utm_clp: references.utm_clp,
      utm_month: references.utm_month,
      imm_clp: references.imm_clp,
      captured_at: new Date().toISOString(),
    },

    caps_clp: {
      pension: parameters.caps.pension_uf * references.uf_clp,
      health: parameters.caps.health_uf * references.uf_clp,
      work_injury: parameters.caps.work_injury_uf * references.uf_clp,
      afc: parameters.caps.afc_uf * references.uf_clp,
    },

    full_data: parameters,
  };
}
