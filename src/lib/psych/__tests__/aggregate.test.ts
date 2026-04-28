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
});
