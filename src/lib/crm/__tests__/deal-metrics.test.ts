import { describe, expect, it } from "vitest";
import {
  ageBucket,
  daysInStage,
  dealProbability,
  formatClpCompact,
  sanitizeStageColor,
  stageFallbackProbability,
  summarizeDeals,
  type DealForMetrics,
  type StageLike,
} from "@/lib/crm/deal-metrics";

const openStages: StageLike[] = [
  { id: "s1", order: 1 },
  { id: "s2", order: 2 },
  { id: "s3", order: 3 },
];

function deal(partial: Partial<DealForMetrics> & { id: string; stageId: string }): DealForMetrics {
  return {
    createdAt: "2026-01-01T12:00:00.000Z",
    probability: 0,
    ...partial,
  };
}

describe("daysInStage", () => {
  it("usa createdAt cuando no hay stageHistory", () => {
    const result = daysInStage(
      deal({ id: "d1", stageId: "s1", createdAt: "2026-07-01T12:00:00.000Z" }),
    );
    expect(result.source).toBe("created_at");
    expect(result.days).toBeGreaterThanOrEqual(0);
  });

  it("toma la entrada más reciente a la etapa actual tras rebotes", () => {
    const result = daysInStage(
      deal({
        id: "d1",
        stageId: "s2",
        createdAt: "2026-01-01T12:00:00.000Z",
        stageHistory: [
          { toStageId: "s2", changedAt: "2026-08-01T12:00:00.000Z" },
          { toStageId: "s3", changedAt: "2026-07-15T12:00:00.000Z" },
          { toStageId: "s2", changedAt: "2026-06-01T12:00:00.000Z" },
        ],
      }),
    );
    expect(result.source).toBe("stage_history");
    // history ya viene orderBy changedAt desc → primera match es la más reciente
    expect(result.days).toBeLessThan(40);
  });
});

describe("ageBucket", () => {
  it("clasifica ok / warn / danger", () => {
    expect(ageBucket(0)).toBe("ok");
    expect(ageBucket(7)).toBe("ok");
    expect(ageBucket(8)).toBe("warn");
    expect(ageBucket(30)).toBe("warn");
    expect(ageBucket(31)).toBe("danger");
  });
});

describe("stageFallbackProbability / dealProbability", () => {
  it("interpola etapas abiertas y respeta won/lost/accepted", () => {
    expect(stageFallbackProbability({ id: "w", isClosedWon: true }, openStages)).toBe(100);
    expect(stageFallbackProbability({ id: "l", isClosedLost: true }, openStages)).toBe(0);
    expect(stageFallbackProbability({ id: "a", isAccepted: true }, openStages)).toBe(90);
    expect(stageFallbackProbability(openStages[0], openStages)).toBe(10);
    expect(stageFallbackProbability(openStages[2], openStages)).toBe(90);
  });

  it("usa probabilidad del deal cuando > 0", () => {
    expect(
      dealProbability(deal({ id: "d", stageId: "s1", probability: 40 }), openStages[0], openStages),
    ).toBeCloseTo(0.4);
    expect(
      dealProbability(deal({ id: "d", stageId: "s1", probability: 0 }), openStages[0], openStages),
    ).toBeCloseTo(0.1);
  });

  it("etapa abierta única → 50", () => {
    expect(stageFallbackProbability({ id: "only" }, [{ id: "only", order: 1 }])).toBe(50);
  });
});

describe("summarizeDeals", () => {
  it("agrega pipeline abierto y trata monto 0", () => {
    const stages: StageLike[] = [
      ...openStages,
      { id: "won", order: 4, isClosedWon: true },
      { id: "lost", order: 5, isClosedLost: true },
    ];
    const deals: DealForMetrics[] = [
      deal({
        id: "a",
        stageId: "s1",
        probability: 50,
        activeQuoteSummary: { amountClp: 1_000_000, amountUf: 25, totalGuards: 4 },
      }),
      deal({
        id: "b",
        stageId: "s2",
        activeQuoteSummary: { amountClp: 0, amountUf: 0, totalGuards: 0 },
      }),
      deal({
        id: "c",
        stageId: "won",
        activeQuoteSummary: { amountClp: 9_000_000, amountUf: 200, totalGuards: 10 },
      }),
    ];
    const summary = summarizeDeals(deals, stages);
    expect(summary.open.count).toBe(2);
    expect(summary.open.clp).toBe(1_000_000);
    expect(summary.open.guards).toBe(4);
    expect(summary.open.weightedClp).toBe(500_000);
    expect(summary.byStage.won.count).toBe(1);
    expect(summary.byStage.won.clp).toBe(9_000_000);
  });
});

describe("formatClpCompact / sanitizeStageColor", () => {
  it("abrevia montos", () => {
    expect(formatClpCompact(840_000)).toMatch(/\$840K/);
    expect(formatClpCompact(152_900_000)).toMatch(/\$152[,.]9M/);
  });

  it("valida hex de etapa", () => {
    expect(sanitizeStageColor("#0ea5e9")).toBe("#0ea5e9");
    expect(sanitizeStageColor("red")).toBeNull();
    expect(sanitizeStageColor(null)).toBeNull();
  });
});
