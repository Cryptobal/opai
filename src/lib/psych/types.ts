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
  /** Map "valor → peso 0..1" para inflación de la escala. Si falta, fallback {4: 1, 5: 1}. */
  weights?: Record<number, number>;
  /** Compatibilidad con v1.0.0 — valores que cuentan como hit binario. */
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

export type PsychAlertSource = "rule" | "ai";

export type PsychAlertEvidence =
  | {
      kind: "low_dimension";
      threshold: number;
      observed: number;
      worstItems: Array<{
        itemId: string;
        order: number;
        prompt: string;
        response: unknown;
        normalizedScore: number;
      }>;
    }
  | {
      kind: "high_lie";
      threshold: number;
      observed: number;
      hits: Array<{
        itemId: string;
        order: number;
        prompt: string;
        value: number; // 4 o 5
      }>;
    }
  | {
      kind: "straight_lining";
      threshold: number;
      observedStd: number;
      mean: number;
      sequence: Array<{ order: number; value: number }>;
    }
  | {
      kind: "fast_latency";
      threshold: number;
      observedRatio: number;
      fastItems: Array<{
        itemId: string;
        order: number;
        prompt: string;
        latencyMs: number;
        minLatencyMs: number;
      }>;
    }
  | {
      kind: "ai_red_flag";
      itemId: string;
      order: number;
      prompt: string;
      response: string;
      summary: string;
      markers: string[];
      flag: string; // RED_FLAG_AGGRESSION etc.
    }
  | {
      kind: "ai_failure";
      itemId: string;
      order: number;
      prompt: string;
      errorMessage: string;
    };

export interface PsychAlert {
  code: PsychFlag | string;
  severity: "info" | "warning" | "critical";
  message: string;
  dimension?: PsychDimension;
  source: PsychAlertSource;
  evidence?: PsychAlertEvidence;
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
  // Fase 1.5
  reevaluationIntervalMonths: number;
  defaultClientReportLevel: "SEAL" | "SUMMARY" | "FULL";
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
