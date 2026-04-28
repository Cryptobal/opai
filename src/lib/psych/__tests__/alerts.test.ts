import { describe, it, expect } from "vitest";
import { buildAlerts } from "../scoring/alerts";
import type { LoadedAssessmentItem } from "../scoring/prepare";

const item = (
  id: string,
  order: number,
  type: LoadedAssessmentItem["type"],
  dimension: string,
  prompt = "",
): LoadedAssessmentItem => ({
  id,
  order,
  type,
  dimension,
  prompt,
  scoringKey: {},
  reverseScore: false,
  weight: 1,
  minLatencyMs: 800,
});

describe("buildAlerts — evidence", () => {
  it("HIGH_LIE incluye los items que dispararon", () => {
    const items = new Map<string, LoadedAssessmentItem>();
    items.set("lie1", item("lie1", 39, "LIE", "LIE", "Nunca he mentido"));
    items.set("lie2", item("lie2", 40, "LIE", "LIE", "Siempre devuelvo"));
    items.set("lie3", item("lie3", 41, "LIE", "LIE", "Jamás he sentido rabia"));

    const alerts = buildAlerts({
      dimensions: [],
      openAnalyses: [],
      lieScore: 0.6,
      lieHits: [
        { itemId: "lie1", value: 5 },
        { itemId: "lie2", value: 4 },
        { itemId: "lie3", value: 5 },
      ],
      straightLining: false,
      likertSamples: [],
      fastLatency: false,
      latencyRows: [],
      scoredResponses: [],
      items,
      responsesById: new Map(),
    });

    const lie = alerts.find((a) => a.code === "HIGH_LIE");
    expect(lie?.source).toBe("rule");
    expect(lie?.evidence?.kind).toBe("high_lie");
    if (lie?.evidence?.kind === "high_lie") {
      expect(lie.evidence.hits).toHaveLength(3);
      expect(lie.evidence.hits[0].order).toBe(39);
      expect(lie.evidence.hits[0].value).toBe(5);
    }
  });

  it("OPEN_ANALYSIS_FAILED tiene source ai y evidence ai_failure", () => {
    const items = new Map<string, LoadedAssessmentItem>();
    items.set("o44", item("o44", 44, "OPEN", "IMPULSE_CONTROL", "Cuéntame..."));

    const alerts = buildAlerts({
      dimensions: [],
      openAnalyses: [
        {
          itemId: "o44",
          dimensionScores: null,
          markers: [],
          summary: "",
          flags: [],
          error: "Request was aborted",
        },
      ],
      lieScore: 0,
      lieHits: [],
      straightLining: false,
      likertSamples: [],
      fastLatency: false,
      latencyRows: [],
      scoredResponses: [],
      items,
      responsesById: new Map(),
    });

    const fail = alerts.find((a) => a.code === "OPEN_ANALYSIS_FAILED");
    expect(fail?.source).toBe("ai");
    expect(fail?.evidence?.kind).toBe("ai_failure");
    if (fail?.evidence?.kind === "ai_failure") {
      expect(fail.evidence.errorMessage).toBe("Request was aborted");
      expect(fail.evidence.order).toBe(44);
    }
  });
});
