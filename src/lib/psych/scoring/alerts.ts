/**
 * Construye PsychAlert[] a partir del scoring + evidence trazable.
 * Cada alerta lleva `source: "rule" | "ai"` y `evidence` que la UI renderiza
 * en disclosure colapsable.
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
  ScoredResponse,
} from "../types";
import type { LikertSample } from "./detectors";
import type { LoadedAssessmentItem } from "./prepare";
import {
  fastLatencyEvidence,
  highLieEvidence,
  lowDimensionEvidence,
  straightLiningEvidence,
} from "./evidence";

interface AlertInput {
  dimensions: DimensionScore[];
  openAnalyses: OpenAnalysisResult[];
  lieScore: number;
  lieHits: Array<{ itemId: string; value: number }>;
  straightLining: boolean;
  likertSamples: LikertSample[];
  fastLatency: boolean;
  latencyRows: Array<{
    itemId: string;
    latencyMs: number | null;
    minLatencyMs: number;
  }>;
  scoredResponses: ScoredResponse[];
  items: Map<string, LoadedAssessmentItem>;
  responsesById: Map<string, unknown>;
}

export function buildAlerts(input: AlertInput): PsychAlert[] {
  const alerts: PsychAlert[] = [];

  for (const d of input.dimensions) {
    if (d.itemCount === 0) continue; // dimensión no evaluada → no alertas
    if (d.score < 0.3) {
      alerts.push({
        code: `LOW_${d.dimension}`,
        severity: "critical",
        message: `${PSYCH_DIMENSION_LABELS[d.dimension as PsychDimension] ?? d.dimension}: puntaje muy bajo (${Math.round(d.score * 100)}).`,
        dimension: d.dimension as PsychDimension,
        source: "rule",
        evidence: lowDimensionEvidence(
          d.dimension,
          d.score,
          input.scoredResponses,
          input.items,
          input.responsesById,
        ),
      });
    } else if (d.score < 0.5) {
      alerts.push({
        code: `LOW_${d.dimension}`,
        severity: "warning",
        message: `${PSYCH_DIMENSION_LABELS[d.dimension as PsychDimension] ?? d.dimension}: puntaje bajo (${Math.round(d.score * 100)}).`,
        dimension: d.dimension as PsychDimension,
        source: "rule",
        evidence: lowDimensionEvidence(
          d.dimension,
          d.score,
          input.scoredResponses,
          input.items,
          input.responsesById,
        ),
      });
    }
  }

  if (input.lieScore >= 0.6) {
    alerts.push({
      code: PSYCH_FLAGS.HIGH_LIE,
      severity: "warning",
      message: `Escala de mentira elevada (${Math.round(input.lieScore * 100)}%). Posible deseabilidad social — tomar con cautela.`,
      source: "rule",
      evidence: highLieEvidence(input.lieScore, input.lieHits, input.items),
    });
  }

  if (input.straightLining) {
    alerts.push({
      code: PSYCH_FLAGS.STRAIGHT_LINING,
      severity: "warning",
      message:
        "Patrón de respuesta uniforme (straight-lining): el evaluado marcó siempre la misma casilla en Likert.",
      source: "rule",
      evidence: straightLiningEvidence(input.likertSamples),
    });
  }

  if (input.fastLatency) {
    alerts.push({
      code: PSYCH_FLAGS.FAST_LATENCY,
      severity: "info",
      message:
        "Respuestas más rápidas que la latencia mínima esperada — revisar nivel de atención aplicado.",
      source: "rule",
      evidence: fastLatencyEvidence(input.latencyRows, input.items),
    });
  }

  for (const open of input.openAnalyses) {
    const item = input.items.get(open.itemId);
    if (open.error) {
      alerts.push({
        code: PSYCH_FLAGS.OPEN_ANALYSIS_FAILED,
        severity: "info",
        message: `Análisis IA no disponible para pregunta abierta: ${open.error}`,
        source: "ai",
        evidence: {
          kind: "ai_failure",
          itemId: open.itemId,
          order: item?.order ?? 0,
          prompt: item?.prompt ?? "",
          errorMessage: open.error,
        },
      });
      continue;
    }
    for (const flag of open.flags) {
      if (flag.startsWith("RED_FLAG_")) {
        const raw = input.responsesById.get(open.itemId);
        let responseText = "";
        if (typeof raw === "string") {
          responseText = raw;
        } else if (
          typeof raw === "object" &&
          raw !== null &&
          "value" in raw &&
          typeof (raw as { value?: unknown }).value === "string"
        ) {
          responseText = (raw as { value: string }).value;
        }
        alerts.push({
          code: flag,
          severity: "critical",
          message: `Pregunta abierta (${item?.order ?? open.itemId}): ${flag.replace("RED_FLAG_", "").toLowerCase()}.`,
          source: "ai",
          evidence: {
            kind: "ai_red_flag",
            itemId: open.itemId,
            order: item?.order ?? 0,
            prompt: item?.prompt ?? "",
            response: responseText,
            summary: open.summary,
            markers: open.markers,
            flag,
          },
        });
      }
    }
  }

  return alerts;
}
