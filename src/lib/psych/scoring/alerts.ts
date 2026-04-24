/**
 * Genera alertas en base al scoring:
 * - Dimensión < 0.5 (<50 puntos): warning específico.
 * - Dimensión < 0.3: critical.
 * - Lie scale alta: warning de validez.
 * - Straight-lining: warning de validez.
 * - Flags de análisis IA (RED_FLAG_*): crítico.
 */

import {
  PSYCH_DIMENSION_LABELS,
  PSYCH_FLAGS,
  type PsychDimension,
} from "../constants";
import type {
  DimensionScore,
  OpenAnalysisResult,
  PsychAlert,
} from "../types";

interface AlertInput {
  dimensions: DimensionScore[];
  openAnalyses: OpenAnalysisResult[];
  lieScore: number;
  straightLining: boolean;
  fastLatency: boolean;
}

export function buildAlerts(input: AlertInput): PsychAlert[] {
  const alerts: PsychAlert[] = [];

  for (const d of input.dimensions) {
    if (d.score < 0.3) {
      alerts.push({
        code: `LOW_${d.dimension}`,
        severity: "critical",
        message: `${PSYCH_DIMENSION_LABELS[d.dimension as PsychDimension] ?? d.dimension}: puntaje muy bajo (${Math.round(d.score * 100)}).`,
        dimension: d.dimension as PsychDimension,
      });
    } else if (d.score < 0.5) {
      alerts.push({
        code: `LOW_${d.dimension}`,
        severity: "warning",
        message: `${PSYCH_DIMENSION_LABELS[d.dimension as PsychDimension] ?? d.dimension}: puntaje bajo (${Math.round(d.score * 100)}).`,
        dimension: d.dimension as PsychDimension,
      });
    }
  }

  if (input.lieScore >= 0.6) {
    alerts.push({
      code: PSYCH_FLAGS.HIGH_LIE,
      severity: "warning",
      message: `Escala de mentira elevada (${Math.round(input.lieScore * 100)}%). Posible deseabilidad social — tomar con cautela.`,
    });
  }

  if (input.straightLining) {
    alerts.push({
      code: PSYCH_FLAGS.STRAIGHT_LINING,
      severity: "warning",
      message:
        "Patrón de respuesta uniforme (straight-lining): el evaluado marcó siempre la misma casilla en Likert.",
    });
  }

  if (input.fastLatency) {
    alerts.push({
      code: PSYCH_FLAGS.FAST_LATENCY,
      severity: "info",
      message:
        "Respuestas más rápidas que la latencia mínima esperada — revisar nivel de atención aplicado.",
    });
  }

  for (const open of input.openAnalyses) {
    if (open.error) {
      alerts.push({
        code: PSYCH_FLAGS.OPEN_ANALYSIS_FAILED,
        severity: "info",
        message: `Análisis IA no disponible para pregunta abierta: ${open.error}`,
      });
      continue;
    }
    for (const flag of open.flags) {
      if (flag.startsWith("RED_FLAG_")) {
        alerts.push({
          code: flag,
          severity: "critical",
          message: `Pregunta abierta (${open.itemId}): ${flag.replace("RED_FLAG_", "").toLowerCase()}.`,
        });
      }
    }
  }

  return alerts;
}
