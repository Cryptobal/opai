import { describe, expect, it } from "vitest";
import {
  anonymizeGuard,
  classifyGuard,
  classifyInstallationStatus,
  computeGuardSectionScores,
  computeTrend,
  initialsFromName,
} from "@/lib/protocols/knowledge-aggregator";

describe("classifyInstallationStatus", () => {
  it("returns no_protocol when there's no protocol", () => {
    expect(
      classifyInstallationStatus({
        hasProtocol: false,
        evaluatedGuards: 0,
        avgScore: null,
        failedCount: 0,
      }),
    ).toBe("no_protocol");
  });

  it("returns no_evaluated when there's a protocol but nobody has been evaluated", () => {
    expect(
      classifyInstallationStatus({
        hasProtocol: true,
        evaluatedGuards: 0,
        avgScore: null,
        failedCount: 0,
      }),
    ).toBe("no_evaluated");
  });

  it("returns critical when avg < 60 OR there are failed guards", () => {
    expect(
      classifyInstallationStatus({
        hasProtocol: true,
        evaluatedGuards: 4,
        avgScore: 50,
        failedCount: 0,
      }),
    ).toBe("critical");
    expect(
      classifyInstallationStatus({
        hasProtocol: true,
        evaluatedGuards: 4,
        avgScore: 88,
        failedCount: 2,
      }),
    ).toBe("critical");
  });

  it("returns warning between 60 and 79", () => {
    expect(
      classifyInstallationStatus({
        hasProtocol: true,
        evaluatedGuards: 4,
        avgScore: 70,
        failedCount: 0,
      }),
    ).toBe("warning");
  });

  it("returns ok at >= 80", () => {
    expect(
      classifyInstallationStatus({
        hasProtocol: true,
        evaluatedGuards: 4,
        avgScore: 92,
        failedCount: 0,
      }),
    ).toBe("ok");
  });
});

describe("classifyGuard", () => {
  it("approved at >= 80", () => {
    expect(
      classifyGuard({ completed: 1, pending: 0, avgScore: 88, passingScore: 60 }),
    ).toBe("approved");
  });
  it("borderline above passingScore but below 80", () => {
    expect(
      classifyGuard({ completed: 1, pending: 0, avgScore: 70, passingScore: 60 }),
    ).toBe("borderline");
  });
  it("failed below passingScore", () => {
    expect(
      classifyGuard({ completed: 1, pending: 0, avgScore: 50, passingScore: 60 }),
    ).toBe("failed");
  });
  it("pending when there are pending and no completed", () => {
    expect(
      classifyGuard({ completed: 0, pending: 1, avgScore: null, passingScore: 60 }),
    ).toBe("pending");
  });
  it("unevaluated otherwise", () => {
    expect(
      classifyGuard({ completed: 0, pending: 0, avgScore: null, passingScore: 60 }),
    ).toBe("unevaluated");
  });
});

describe("computeTrend", () => {
  it("returns null with fewer than 2 entries", () => {
    expect(computeTrend([])).toBeNull();
    expect(computeTrend([{ month: "2025-01", avg: 70 }])).toBeNull();
  });
  it("returns up when last avg is higher", () => {
    expect(
      computeTrend([
        { month: "2025-01", avg: 60 },
        { month: "2025-02", avg: 80 },
      ]),
    ).toBe("up");
  });
  it("returns down when last avg is lower", () => {
    expect(
      computeTrend([
        { month: "2025-01", avg: 80 },
        { month: "2025-02", avg: 60 },
      ]),
    ).toBe("down");
  });
  it("returns stable for tiny changes", () => {
    expect(
      computeTrend([
        { month: "2025-01", avg: 70 },
        { month: "2025-02", avg: 70.5 },
      ]),
    ).toBe("stable");
  });
});

describe("anonymizeGuard", () => {
  it("returns J. R. for Juan Ramirez", () => {
    const r = anonymizeGuard("Juan Ramirez", "abc-123", "tenant-x");
    expect(r.initials).toBe("J. R.");
    expect(r.opaqueId).toMatch(/^g_[a-f0-9]{12}$/);
  });
  it("collapses to a single initial when only one part", () => {
    const r = anonymizeGuard("Juan", "id-1", "tenant-x");
    expect(r.initials).toBe("J.");
  });
  it("is deterministic given the same salt", () => {
    const a = anonymizeGuard("Juan Ramirez", "abc", "salt");
    const b = anonymizeGuard("Juan Ramirez", "abc", "salt");
    expect(a.opaqueId).toBe(b.opaqueId);
  });
  it("changes opaqueId when salt changes", () => {
    const a = anonymizeGuard("Juan Ramirez", "abc", "salt-a");
    const b = anonymizeGuard("Juan Ramirez", "abc", "salt-b");
    expect(a.opaqueId).not.toBe(b.opaqueId);
  });
});

describe("initialsFromName", () => {
  it("returns first+last initial concatenated", () => {
    expect(initialsFromName("Juan Ramirez")).toBe("JR");
  });
  it("returns just the first letter when single name", () => {
    expect(initialsFromName("Juan")).toBe("J");
  });
});

describe("computeGuardSectionScores", () => {
  it("computes section percent based on correct answers", () => {
    const sectionA = "sec-a";
    const sectionB = "sec-b";
    const known = new Set([sectionA, sectionB]);

    const completed = [
      {
        answers: [0, 1, 0],
        exam: {
          questions: [
            { id: "q1", correctAnswer: 0, sectionRef: sectionA, order: 0 },
            { id: "q2", correctAnswer: 1, sectionRef: sectionA, order: 1 },
            { id: "q3", correctAnswer: 1, sectionRef: sectionB, order: 2 },
          ],
        },
      },
    ];

    const scores = computeGuardSectionScores(completed, known);
    expect(scores[sectionA]).toBe(100);
    expect(scores[sectionB]).toBe(0);
  });

  it("returns null for sections without any answered questions", () => {
    const known = new Set(["empty"]);
    const scores = computeGuardSectionScores([], known);
    expect(scores["empty"]).toBeNull();
  });
});
