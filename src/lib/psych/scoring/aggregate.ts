/**
 * Agrupa scores normalizados por dimensión y calcula score global.
 * - Por dimensión: promedio ponderado por `item.weight`.
 * - Aplica peso del tenant (TenantPsychConfig.weightXxx).
 * - Score global: promedio ponderado de dimensiones × 100.
 */

import { PSYCH_DIMENSIONS, type PsychDimension } from "../constants";
import type {
  DimensionScore,
  OpenAnalysisResult,
  ResolvedTenantPsychConfig,
  ScoredResponse,
} from "../types";

interface AggregateInput {
  scoredResponses: ScoredResponse[];
  openAnalyses: OpenAnalysisResult[];
  config: ResolvedTenantPsychConfig;
}

function weightedMean(rows: Array<{ score: number; weight: number }>): {
  mean: number;
  count: number;
} {
  if (rows.length === 0) return { mean: 0.5, count: 0 };
  let num = 0;
  let den = 0;
  for (const r of rows) {
    const w = r.weight > 0 ? r.weight : 0;
    num += r.score * w;
    den += w;
  }
  if (den === 0) return { mean: 0.5, count: rows.length };
  return { mean: num / den, count: rows.length };
}

/**
 * Mezcla contribución IA para dimensiones OPEN con el resto de respuestas.
 */
function collectDimensionInputs(
  dim: PsychDimension,
  scored: ScoredResponse[],
  openAnalyses: OpenAnalysisResult[],
): Array<{ score: number; weight: number }> {
  const rows: Array<{ score: number; weight: number }> = [];
  for (const s of scored) {
    if (s.dimension === dim) rows.push({ score: s.normalizedScore, weight: s.weight });
  }
  for (const open of openAnalyses) {
    if (!open.dimensionScores) continue;
    const v = open.dimensionScores[dim];
    if (typeof v === "number") rows.push({ score: v, weight: 1.5 });
  }
  return rows;
}

export function aggregateScores(input: AggregateInput): {
  dimensions: DimensionScore[];
  globalScore: number;
} {
  const { scoredResponses, openAnalyses, config } = input;
  const dimensions: DimensionScore[] = [];

  let globalNum = 0;
  let globalDen = 0;

  for (const dim of PSYCH_DIMENSIONS) {
    const rows = collectDimensionInputs(dim, scoredResponses, openAnalyses);
    const { mean, count } = weightedMean(rows);
    dimensions.push({ dimension: dim, score: mean, itemCount: count });

    const tenantWeight = config.weights[dim] ?? 1.0;
    if (tenantWeight <= 0) continue; // peso 0 = dimensión informativa, no entra al global
    globalNum += mean * tenantWeight;
    globalDen += tenantWeight;
  }

  const globalRaw = globalDen > 0 ? globalNum / globalDen : 0.5;
  const globalScore = Math.round(globalRaw * 100 * 100) / 100; // 0..100, 2 decimales

  return { dimensions, globalScore };
}
