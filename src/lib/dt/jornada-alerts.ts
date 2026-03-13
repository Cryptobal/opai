/**
 * Alertas de proximidad de límite de horas (Ley 21.561)
 * - Guardia acumula > 40h en la semana → alerta amarilla
 * - Guardia acumula > maxHorasSemanales → alerta roja
 * - Jornada del día > 12h → alerta inmediata
 * - Más de 2h extras en un día → alerta (DS 48/2024)
 */

import type { JornadaLimits } from "./jornada-config";

export type AlertLevel = "warning" | "critical";
export type AlertType =
  | "weekly_proximity"
  | "weekly_exceeded"
  | "daily_exceeded"
  | "overtime_exceeded";

export interface JornadaAlert {
  level: AlertLevel;
  type: AlertType;
  guardiaId: string;
  guardiaName: string;
  installationName?: string;
  message: string;
  value: number;
  limit: number;
}

export interface WeeklyHoursInput {
  guardiaId: string;
  guardiaName: string;
  installationName?: string;
  horasAcumuladasSemana: number;
  horasDia: number;
  horasExtrasDia: number;
}

const WEEKLY_WARNING_THRESHOLD = 40;

export function evaluateJornadaAlerts(
  input: WeeklyHoursInput,
  limits: JornadaLimits
): JornadaAlert[] {
  const alerts: JornadaAlert[] = [];
  const base = {
    guardiaId: input.guardiaId,
    guardiaName: input.guardiaName,
    installationName: input.installationName,
  };

  if (
    input.horasAcumuladasSemana > WEEKLY_WARNING_THRESHOLD &&
    input.horasAcumuladasSemana <= limits.maxHorasSemanales
  ) {
    alerts.push({
      ...base,
      level: "warning",
      type: "weekly_proximity",
      message: `${input.guardiaName} acumula ${input.horasAcumuladasSemana.toFixed(1)}h esta semana (límite: ${limits.maxHorasSemanales}h)`,
      value: input.horasAcumuladasSemana,
      limit: limits.maxHorasSemanales,
    });
  }

  if (input.horasAcumuladasSemana > limits.maxHorasSemanales) {
    alerts.push({
      ...base,
      level: "critical",
      type: "weekly_exceeded",
      message: `${input.guardiaName} excede el límite semanal: ${input.horasAcumuladasSemana.toFixed(1)}h / ${limits.maxHorasSemanales}h`,
      value: input.horasAcumuladasSemana,
      limit: limits.maxHorasSemanales,
    });
  }

  if (input.horasDia > limits.maxHorasDiarias) {
    alerts.push({
      ...base,
      level: "critical",
      type: "daily_exceeded",
      message: `${input.guardiaName} excede jornada diaria: ${input.horasDia.toFixed(1)}h / ${limits.maxHorasDiarias}h`,
      value: input.horasDia,
      limit: limits.maxHorasDiarias,
    });
  }

  if (input.horasExtrasDia > limits.maxHorasExtras) {
    alerts.push({
      ...base,
      level: "critical",
      type: "overtime_exceeded",
      message: `${input.guardiaName} excede horas extras diarias: ${input.horasExtrasDia.toFixed(1)}h / ${limits.maxHorasExtras}h (DS 48/2024)`,
      value: input.horasExtrasDia,
      limit: limits.maxHorasExtras,
    });
  }

  return alerts;
}
