import { describe, it, expect } from "vitest";
import { aggregateScores } from "../scoring/aggregate";
import type { ResolvedTenantPsychConfig, ScoredResponse } from "../types";

const baseConfig: ResolvedTenantPsychConfig = {
  tenantId: "t1",
  weights: {
    IMPULSE_CONTROL: 1, FRUSTRATION_TOLERANCE: 1, EMOTIONAL_STABILITY: 1,
    STRESS_MANAGEMENT: 1, SUSTAINED_ATTENTION: 1, REASONING: 1,
    INTEGRITY: 1, RESPONSIBILITY: 1, VOCATIONAL_FIT: 0,
  },
  thresholdFit: 80, thresholdCaution: 60,
  requirePsychReview: false, invitationTTLHours: 168,
  brandLogoUrl: null, brandPrimaryColor: null,
  defaultVersionCode: "security-guard-v1", defaultVersionTag: "1.1.0",
  reevaluationIntervalMonths: 6, defaultClientReportLevel: "SEAL",
};

const lowVocationalResponse: ScoredResponse = {
  itemId: "voc1", dimension: "VOCATIONAL_FIT", type: "SJT",
  normalizedScore: 0.1, weight: 1, latencyMs: 1000, minLatencyMs: 800, fastLatency: false,
};

describe("aggregateScores — peso 0 en VOCATIONAL_FIT", () => {
  it("calcula score de la dimensión pero NO la mezcla en el global", () => {
    const r = aggregateScores({
      scoredResponses: [lowVocationalResponse],
      openAnalyses: [],
      config: baseConfig,
    });
    const voc = r.dimensions.find((d) => d.dimension === "VOCATIONAL_FIT");
    expect(voc?.score).toBeCloseTo(0.1, 2);
    expect(voc?.itemCount).toBe(1);
    // Global: solo VOCATIONAL_FIT tiene response, pero peso 0 → fallback 0.5 al no haber peso
    expect(r.globalScore).toBe(50);
  });

  it("dimensión sin items reporta itemCount=0 y score 0.5", () => {
    const r = aggregateScores({
      scoredResponses: [lowVocationalResponse],
      openAnalyses: [],
      config: baseConfig,
    });
    const reasoning = r.dimensions.find((d) => d.dimension === "REASONING");
    expect(reasoning?.itemCount).toBe(0);
    expect(reasoning?.score).toBe(0.5);
  });

  it("peso 0 + dimensión real con peso > 0: solo la real entra al global", () => {
    const high: ScoredResponse = { ...lowVocationalResponse, normalizedScore: 1.0 };
    const lowReal: ScoredResponse = {
      itemId: "imp1", dimension: "IMPULSE_CONTROL", type: "SJT",
      normalizedScore: 0.0, weight: 1, latencyMs: 1000, minLatencyMs: 800, fastLatency: false,
    };
    const r = aggregateScores({
      scoredResponses: [high, lowReal],
      openAnalyses: [],
      config: baseConfig,
    });
    // VOCATIONAL_FIT (peso 0, score 1.0) NO debe contaminar el global.
    // IMPULSE_CONTROL=0 + 7 dimensiones sin items a 0.5 cada una con peso 1
    // → (0*1 + 0.5*7) / 8 = 3.5/8 = 0.4375 → globalScore = 43.75.
    // Sin el guard, VOCATIONAL_FIT contribuiría 1.0*0 = 0 al numerador y 0 al denominador
    // (porque su peso es 0), por lo que el resultado sería el mismo.
    // Pero si alguien futurice cambia "peso 0" por "peso pequeño" (ej: 0.001),
    // este test detecta el bleed-through.
    expect(r.globalScore).toBeCloseTo(43.75, 2);
  });

  it("peso NEGATIVO también se trata como informativo (no contamina global)", () => {
    const negConfig: ResolvedTenantPsychConfig = {
      ...baseConfig,
      weights: { ...baseConfig.weights, VOCATIONAL_FIT: -1 },
    };
    const high: ScoredResponse = { ...lowVocationalResponse, normalizedScore: 1.0 };
    const r = aggregateScores({
      scoredResponses: [high],
      openAnalyses: [],
      config: negConfig,
    });
    // Sin el guard `tenantWeight <= 0 continue`, este caso restaría:
    // globalNum = 1.0 * (-1) + 0.5*8 = 3.0, globalDen = -1 + 8 = 7 → ~42.86
    // Con el guard: globalNum = 0.5*8 = 4, globalDen = 8 → 50.
    expect(r.globalScore).toBe(50);
  });
});
