import type { GamificacionConfig } from "@prisma/client";

export interface DimensionResult {
  score: number; // 0-100, or -1 = no data (redistribute weight)
  detalle: Record<string, unknown>;
}

export interface TrustScoreCompuesto {
  trustScore: number;
  scoreRondas: number;
  scoreAsistencia: number;
  scoreSistemaDigital: number;
  scoreSupervision: number;
  scoreCapacitacion: number;
  detalleRondas: Record<string, unknown>;
  detalleAsistencia: Record<string, unknown>;
  detalleSistemaDigital: Record<string, unknown>;
  detalleSupervision: Record<string, unknown>;
  detalleCapacitacion: Record<string, unknown>;
}

export type EventoTipo =
  | "ronda_perfecta"
  | "ronda_completada"
  | "ronda_no_realizada"
  | "entrada_puntual"
  | "salida_completa"
  | "tardanza"
  | "inasistencia"
  | "turno_extra"
  | "marcacion_digital"
  | "eval_sobresaliente"
  | "eval_buena"
  | "hallazgo_negativo"
  | "examen_aprobado"
  | "examen_perfecto"
  | "incidente_reportado"
  | "tarea_checkpoint"
  | "reconocimiento_recibido"
  | "reconocimiento_dado"
  | "badge_desbloqueado"
  | "racha_bonus"
  | "semana_perfecta"
  | "asistencia_perfecta_mes";

export type EventoDimension =
  | "rondas"
  | "asistencia"
  | "sistema_digital"
  | "supervision"
  | "capacitacion"
  | "social"
  | "bonus";

export interface NivelDefinition {
  nombre: string;
  puntosMinimos: number;
}

export type GamificacionConfigData = GamificacionConfig;
