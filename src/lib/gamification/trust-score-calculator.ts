import type { GamificacionConfig } from "@prisma/client";
import type { TrustScoreCompuesto, DimensionResult } from "./types";
import { calcularScoreRondas } from "./dimensions/rondas";
import { calcularScoreAsistencia } from "./dimensions/asistencia";
import { calcularScoreSistemaDigital } from "./dimensions/sistema-digital";
import { calcularScoreSupervision } from "./dimensions/supervision";
import { calcularScoreCapacitacion } from "./dimensions/capacitacion";

interface DimensionWeight {
  key: string;
  peso: number;
  result: DimensionResult;
}

export async function calcularTrustScoreCompuesto(
  guardiaId: string,
  tenantId: string,
  fechaInicio: Date,
  fechaFin: Date,
  config: GamificacionConfig,
): Promise<TrustScoreCompuesto> {
  const [rondas, asistencia, sistemaDigital, supervision, capacitacion] =
    await Promise.all([
      calcularScoreRondas(guardiaId, tenantId, fechaInicio, fechaFin),
      calcularScoreAsistencia(guardiaId, tenantId, fechaInicio, fechaFin),
      calcularScoreSistemaDigital(guardiaId, tenantId, fechaInicio, fechaFin),
      calcularScoreSupervision(guardiaId, tenantId, fechaInicio, fechaFin),
      calcularScoreCapacitacion(guardiaId, tenantId, fechaInicio, fechaFin),
    ]);

  const dimensions: DimensionWeight[] = [
    { key: "rondas", peso: config.pesoRondas, result: rondas },
    { key: "asistencia", peso: config.pesoAsistencia, result: asistencia },
    { key: "sistemaDigital", peso: config.pesoSistemaDigital, result: sistemaDigital },
    { key: "supervision", peso: config.pesoSupervision, result: supervision },
    { key: "capacitacion", peso: config.pesoCapacitacion, result: capacitacion },
  ];

  const withData = dimensions.filter((d) => d.result.score >= 0);
  const totalPesoConDatos = withData.reduce((s, d) => s + d.peso, 0);

  let trustScore = 0;
  if (totalPesoConDatos > 0) {
    trustScore = Math.min(100, Math.max(0, Math.round(
      withData.reduce((s, d) => s + d.result.score * (d.peso / totalPesoConDatos), 0),
    )));
  }

  return {
    trustScore,
    scoreRondas: Math.max(0, rondas.score),
    scoreAsistencia: Math.max(0, asistencia.score),
    scoreSistemaDigital: Math.max(0, sistemaDigital.score),
    scoreSupervision: Math.max(0, supervision.score),
    scoreCapacitacion: Math.max(0, capacitacion.score),
    detalleRondas: rondas.detalle,
    detalleAsistencia: asistencia.detalle,
    detalleSistemaDigital: sistemaDigital.detalle,
    detalleSupervision: supervision.detalle,
    detalleCapacitacion: capacitacion.detalle,
  };
}
