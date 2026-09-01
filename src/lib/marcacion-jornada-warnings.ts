/**
 * Avisos no bloqueantes de jornada ordinaria excesiva (Art. 45.2).
 */

import {
  durHoras,
  MAX_HORAS_DIARIA_ORDINARIA,
  type JornadaLimits,
} from "@/lib/dt/jornada-calc";

export type JornadaWarning = {
  code: "jornada_diaria" | "jornada_semanal";
  message: string;
};

export function evaluateOrdinaryJornadaWarnings(input: {
  horasDiarias: number;
  horasSemanales: number;
  maxHorasDiarias?: number;
  maxHorasSemanales: number;
}): JornadaWarning[] {
  const maxDiarias = input.maxHorasDiarias ?? MAX_HORAS_DIARIA_ORDINARIA;
  const warnings: JornadaWarning[] = [];
  if (input.horasDiarias > maxDiarias) {
    warnings.push({
      code: "jornada_diaria",
      message: `La jornada ordinaria diaria (${input.horasDiarias.toFixed(1)} h) excede el límite legal de ${maxDiarias} h.`,
    });
  }
  if (input.horasSemanales > input.maxHorasSemanales) {
    warnings.push({
      code: "jornada_semanal",
      message: `La jornada ordinaria semanal (${input.horasSemanales.toFixed(1)} h) excede el límite vigente de ${input.maxHorasSemanales} h.`,
    });
  }
  return warnings;
}

export function hoursFromShift(shiftStart: string | null | undefined, shiftEnd: string | null | undefined): number {
  if (!shiftStart || !shiftEnd) return 0;
  return durHoras(shiftStart, shiftEnd);
}

export function evaluateShiftAgainstLimits(params: {
  shiftStart: string | null | undefined;
  shiftEnd: string | null | undefined;
  weeklyHours: number;
  limits: JornadaLimits;
}): JornadaWarning[] {
  return evaluateOrdinaryJornadaWarnings({
    horasDiarias: hoursFromShift(params.shiftStart, params.shiftEnd),
    horasSemanales: params.weeklyHours,
    maxHorasDiarias: MAX_HORAS_DIARIA_ORDINARIA,
    maxHorasSemanales: params.limits.maxHorasSemanales,
  });
}
