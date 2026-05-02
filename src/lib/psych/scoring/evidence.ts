/**
 * Helpers para construir el campo `evidence` de cada PsychAlert.
 * Mantiene `alerts.ts` legible y el formato es contrato público (UI lo renderiza).
 */

import type { PsychAlertEvidence, ScoredResponse } from "../types";
import type { LikertSample } from "./detectors";
import type { LoadedAssessmentItem } from "./prepare";

export function lowDimensionEvidence(
  dim: string,
  score: number,
  scored: ScoredResponse[],
  items: Map<string, LoadedAssessmentItem>,
  responses: Map<string, unknown>,
): PsychAlertEvidence {
  const dimResponses = scored
    .filter((r) => r.dimension === dim)
    .sort((a, b) => a.normalizedScore - b.normalizedScore)
    .slice(0, 3)
    .map((r) => {
      const item = items.get(r.itemId);
      return {
        itemId: r.itemId,
        order: item?.order ?? 0,
        prompt: item?.prompt ?? "",
        response: responses.get(r.itemId),
        normalizedScore: r.normalizedScore,
      };
    });
  return {
    kind: "low_dimension",
    threshold: 0.5,
    observed: score,
    worstItems: dimResponses,
  };
}

export function highLieEvidence(
  lieScore: number,
  hits: Array<{ itemId: string; value: number }>,
  items: Map<string, LoadedAssessmentItem>,
): PsychAlertEvidence {
  return {
    kind: "high_lie",
    threshold: 0.6,
    observed: lieScore,
    hits: hits.map((h) => {
      const item = items.get(h.itemId);
      return {
        itemId: h.itemId,
        order: item?.order ?? 0,
        prompt: item?.prompt ?? "",
        value: h.value,
      };
    }),
  };
}

export function straightLiningEvidence(
  samples: LikertSample[],
): PsychAlertEvidence {
  const n = samples.length;
  const mean = samples.reduce((a, s) => a + s.value, 0) / Math.max(n, 1);
  const variance =
    samples.reduce((a, s) => a + Math.pow(s.value - mean, 2), 0) /
    Math.max(n, 1);
  const std = Math.sqrt(variance);
  return {
    kind: "straight_lining",
    threshold: 0.5,
    observedStd: std,
    mean,
    sequence: samples.map((s) => ({ order: s.itemOrder, value: s.value })),
  };
}

export function fastLatencyEvidence(
  rows: Array<{
    itemId: string;
    latencyMs: number | null;
    minLatencyMs: number;
  }>,
  items: Map<string, LoadedAssessmentItem>,
): PsychAlertEvidence {
  const fast = rows.filter(
    (r) => r.latencyMs != null && r.latencyMs < r.minLatencyMs,
  );
  return {
    kind: "fast_latency",
    threshold: 0.3,
    observedRatio: rows.length > 0 ? fast.length / rows.length : 0,
    fastItems: fast.map((r) => {
      const item = items.get(r.itemId);
      return {
        itemId: r.itemId,
        order: item?.order ?? 0,
        prompt: item?.prompt ?? "",
        latencyMs: r.latencyMs ?? 0,
        minLatencyMs: r.minLatencyMs,
      };
    }),
  };
}
