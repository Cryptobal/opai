/**
 * Helpers compartidos para los ítems del seed security-guard-v1.
 * Las opciones Likert son idénticas en todos los ítems de ese tipo.
 */

import type {
  LikertOption,
  LikertScoringKey,
  LieScoringKey,
} from "@/lib/psych/types";

export const LIKERT_OPTIONS: LikertOption[] = [
  { value: 1, label: "Muy en desacuerdo" },
  { value: 2, label: "En desacuerdo" },
  { value: 3, label: "Neutro" },
  { value: 4, label: "De acuerdo" },
  { value: 5, label: "Muy de acuerdo" },
];

export function likertKey(
  direction: "positive" | "negative",
): LikertScoringKey {
  return { kind: "likert", scale: 5, direction };
}

export function lieKey(): LieScoringKey {
  // "Muy de acuerdo" (5) y "De acuerdo" (4) inflan la escala de mentira.
  return { kind: "lie", extremePositiveValues: [4, 5] };
}

export interface SeedItem {
  order: number;
  type: "LIKERT" | "SJT" | "COGNITIVE" | "OPEN" | "LIE";
  dimension: string;
  prompt: string;
  // Aceptamos unknown[]|null para que el seed sirva tipos JSON arbitrarios.
  options: unknown;
  scoringKey: unknown;
  reverseScore?: boolean;
  weight?: number;
  minLatencyMs?: number;
  maxLatencyMs?: number;
}
