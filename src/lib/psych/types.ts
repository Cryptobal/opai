/**
 * Tipos compartidos del módulo psicolaboral.
 * El contrato de JSON almacenado en Prisma (options, scoringKey, dimensionScores,
 * alerts, openAnalysis) vive aquí para mantener consistencia entre seed, scoring,
 * UI pública y dashboard.
 */

import type { PsychDimension, PsychFlag } from "./constants";

// ── Options por tipo de item (Json en DB) ──

export interface LikertOption {
  value: number; // 1..5
  label: string;
}

export interface SjtOption {
  value: string; // "A" | "B" | "C" | "D"
  label: string;
}

export type CognitiveOption = SjtOption; // mismo shape

export type PsychItemOptions = LikertOption[] | SjtOption[] | null;

// ── ScoringKey por tipo de item (Json en DB) ──

export interface LikertScoringKey {
  kind: "likert";
  scale: 5;
  direction: "positive" | "negative";
}

export interface SjtScoringKey {
  kind: "sjt";
  bestValue: string;
  scores: Record<string, number>; // "A": 1.0, "B": 0.6, ...
}

export interface CognitiveScoringKey {
  kind: "cognitive";
  correctValue: string;
}

export interface OpenScoringKey {
  kind: "open";
  rubric: "ai_analysis";
  dimensions: PsychDimension[];
}

export interface LieScoringKey {
  kind: "lie";
  // En escala de 5 puntos, "muy de acuerdo" (5) eleva lieScaleScore.
  extremePositiveValues: number[];
}

export type PsychScoringKey =
  | LikertScoringKey
  | SjtScoringKey
  | CognitiveScoringKey
  | OpenScoringKey
  | LieScoringKey;

// ── Respuesta del evaluado (value en PsychResponse) ──

export type PsychResponseValue =
  | { kind: "likert"; value: number }
  | { kind: "sjt"; value: string }
  | { kind: "cognitive"; value: string }
  | { kind: "open"; value: string }
  | { kind: "lie"; value: number };

// ── Resultado de scoring ──

export interface DimensionScore {
  dimension: PsychDimension;
  score: number; // 0..1
  itemCount: number;
}

export interface PsychAlert {
  code: PsychFlag | string;
  severity: "info" | "warning" | "critical";
  message: string;
  dimension?: PsychDimension;
}

export interface OpenAnalysisResult {
  itemId: string;
  dimensionScores: Partial<Record<PsychDimension, number>> | null;
  markers: string[];
  summary: string;
  flags: string[];
  error?: string;
}

export interface ResolvedTenantPsychConfig {
  tenantId: string;
  weights: Record<PsychDimension, number>;
  thresholdFit: number;
  thresholdCaution: number;
  requirePsychReview: boolean;
  invitationTTLHours: number;
  brandLogoUrl: string | null;
  brandPrimaryColor: string | null;
  defaultVersionCode: string;
  defaultVersionTag: string;
}

// ── Scoring intermedio (no se persiste) ──

export interface ScoredResponse {
  itemId: string;
  dimension: PsychDimension | null; // null para LIE
  type: "LIKERT" | "SJT" | "COGNITIVE" | "OPEN" | "LIE";
  normalizedScore: number; // 0..1
  weight: number;
  latencyMs: number | null;
  minLatencyMs: number;
  fastLatency: boolean;
}
