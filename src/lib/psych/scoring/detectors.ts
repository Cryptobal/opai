/**
 * Detectores de patrones anómalos en las respuestas.
 * - Straight-lining: evaluado marca siempre la misma casilla en Likert
 *   (desviación estándar < 0.5 sobre escala 1-5).
 * - Lie scale: promedio de LIE items (respuestas "de acuerdo"/"muy de acuerdo").
 * - Fast latency: respuestas más rápidas que minLatencyMs del item.
 */

import { extractLikertValue } from "./normalize";

export interface LikertSample {
  value: number;
  itemOrder: number;
}

export function detectStraightLining(samples: LikertSample[]): boolean {
  if (samples.length < 6) return false;
  const n = samples.length;
  const mean = samples.reduce((a, s) => a + s.value, 0) / n;
  const variance =
    samples.reduce((a, s) => a + Math.pow(s.value - mean, 2), 0) / n;
  const std = Math.sqrt(variance);
  return std < 0.5;
}

export interface LieInput {
  value: unknown;
  extremeValues: number[]; // ej: [4, 5]
}

export function computeLieScore(inputs: LieInput[]): number {
  if (inputs.length === 0) return 0;
  let hits = 0;
  for (const inp of inputs) {
    const v = extractLikertValue(inp.value);
    if (v !== null && inp.extremeValues.includes(v)) hits += 1;
  }
  return hits / inputs.length;
}

/**
 * Evalúa si al menos el threshold% de las respuestas fueron más rápidas que
 * el minLatencyMs del item. Retorna true si el candidato está "bombeando" el
 * test sin leer.
 */
export function detectFastLatency(
  rows: Array<{ latencyMs: number | null; minLatencyMs: number }>,
  threshold = 0.3,
): boolean {
  if (rows.length === 0) return false;
  let fast = 0;
  let counted = 0;
  for (const r of rows) {
    if (r.latencyMs == null) continue;
    counted += 1;
    if (r.latencyMs < r.minLatencyMs) fast += 1;
  }
  if (counted === 0) return false;
  return fast / counted >= threshold;
}

/**
 * Considera "lie scale alta" cuando el score es ≥ 0.6 (4 de 5 respuestas extremas).
 */
export function isHighLie(lieScore: number): boolean {
  return lieScore >= 0.6;
}
