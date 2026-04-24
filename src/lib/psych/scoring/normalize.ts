/**
 * Normaliza una respuesta individual a score 0..1 según tipo de item.
 * No aplica pesos — eso lo hace aggregate.ts.
 */

import type { Prisma } from "@prisma/client";
import type {
  LikertScoringKey,
  SjtScoringKey,
  CognitiveScoringKey,
  LieScoringKey,
  PsychScoringKey,
} from "../types";

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

export function normalizeLikert(
  value: unknown,
  key: LikertScoringKey,
  reverse: boolean,
): number {
  const v = Number(value);
  if (!Number.isFinite(v) || v < 1 || v > key.scale) return 0;
  const scaled = (v - 1) / (key.scale - 1); // 0..1
  if (reverse || key.direction === "negative") return clamp01(1 - scaled);
  return clamp01(scaled);
}

export function normalizeSjt(value: unknown, key: SjtScoringKey): number {
  if (typeof value !== "string") return 0;
  const score = key.scores[value];
  if (typeof score !== "number") return 0;
  return clamp01(score);
}

export function normalizeCognitive(
  value: unknown,
  key: CognitiveScoringKey,
): number {
  return value === key.correctValue ? 1 : 0;
}

export function normalizeLie(value: unknown, key: LieScoringKey): number {
  // Para LIE items, el "score" representa qué tan extremo-positivo fue;
  // lo usa lie scale (no aporta a dimensiones reales).
  const v = Number(value);
  if (!Number.isFinite(v)) return 0;
  return key.extremePositiveValues.includes(v) ? 1 : 0;
}

/**
 * Normaliza cualquier item no-OPEN. Para OPEN, el scoring sale de la IA.
 */
export function normalizeResponse(
  type: "LIKERT" | "SJT" | "COGNITIVE" | "LIE",
  value: unknown,
  scoringKey: Prisma.JsonValue,
  reverseScore: boolean,
): number {
  const key = scoringKey as unknown as PsychScoringKey;
  switch (type) {
    case "LIKERT":
      if (key.kind !== "likert") return 0;
      return normalizeLikert(value, key, reverseScore);
    case "SJT":
      if (key.kind !== "sjt") return 0;
      return normalizeSjt(value, key);
    case "COGNITIVE":
      if (key.kind !== "cognitive") return 0;
      return normalizeCognitive(value, key);
    case "LIE":
      if (key.kind !== "lie") return 0;
      return normalizeLie(value, key);
    default:
      return 0;
  }
}

export function extractLikertValue(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "object" && value !== null && "value" in value) {
    const inner = (value as { value: unknown }).value;
    const n = Number(inner);
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
