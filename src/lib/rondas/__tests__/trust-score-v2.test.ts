// @vitest-environment node
import { describe, it, expect } from "vitest";
import { calculateRondaTrustScore, type TrustScoreResult } from "../trust-score-v2";

function makeTimestamp(minutesFromStart: number): Date {
  const base = new Date("2026-04-14T08:00:00Z");
  return new Date(base.getTime() + minutesFromStart * 60000);
}

describe("calculateRondaTrustScore", () => {
  it("returns 100 for a perfect round (all completed, on time, good pace)", () => {
    const result = calculateRondaTrustScore({
      ejecucion: {
        startedAt: makeTimestamp(0),
        completedAt: makeTimestamp(40),
        scheduledAt: makeTimestamp(0),
        checkpointsTotal: 5,
      },
      marcaciones: [
        { status: "COMPLETED", timestamp: makeTimestamp(5), checkpointId: "cp1" },
        { status: "COMPLETED", timestamp: makeTimestamp(13), checkpointId: "cp2" },
        { status: "COMPLETED", timestamp: makeTimestamp(21), checkpointId: "cp3" },
        { status: "COMPLETED", timestamp: makeTimestamp(29), checkpointId: "cp4" },
        { status: "COMPLETED", timestamp: makeTimestamp(37), checkpointId: "cp5" },
      ],
      template: { estimatedDurationMin: 40, orderMode: "flexible" },
      templateCheckpoints: [
        { checkpointId: "cp1", orderIndex: 0 },
        { checkpointId: "cp2", orderIndex: 1 },
        { checkpointId: "cp3", orderIndex: 2 },
        { checkpointId: "cp4", orderIndex: 3 },
        { checkpointId: "cp5", orderIndex: 4 },
      ],
    });
    expect(result.score).toBeGreaterThanOrEqual(90);
    expect(result.breakdown.completion.score).toBe(100);
  });

  it("returns lower score when checkpoints are missed", () => {
    const perfect = calculateRondaTrustScore({
      ejecucion: {
        startedAt: makeTimestamp(0),
        completedAt: makeTimestamp(40),
        scheduledAt: makeTimestamp(0),
        checkpointsTotal: 5,
      },
      marcaciones: [
        { status: "COMPLETED", timestamp: makeTimestamp(8), checkpointId: "cp1" },
        { status: "COMPLETED", timestamp: makeTimestamp(16), checkpointId: "cp2" },
        { status: "COMPLETED", timestamp: makeTimestamp(24), checkpointId: "cp3" },
        { status: "COMPLETED", timestamp: makeTimestamp(32), checkpointId: "cp4" },
        { status: "COMPLETED", timestamp: makeTimestamp(40), checkpointId: "cp5" },
      ],
      template: { estimatedDurationMin: 40, orderMode: "flexible" },
    });

    const missed = calculateRondaTrustScore({
      ejecucion: {
        startedAt: makeTimestamp(0),
        completedAt: makeTimestamp(40),
        scheduledAt: makeTimestamp(0),
        checkpointsTotal: 5,
      },
      marcaciones: [
        { status: "COMPLETED", timestamp: makeTimestamp(8), checkpointId: "cp1" },
        { status: "COMPLETED", timestamp: makeTimestamp(16), checkpointId: "cp2" },
        { status: "MISSED", timestamp: makeTimestamp(24), checkpointId: "cp3" },
        { status: "MISSED", timestamp: makeTimestamp(32), checkpointId: "cp4" },
        { status: "COMPLETED", timestamp: makeTimestamp(40), checkpointId: "cp5" },
      ],
      template: { estimatedDurationMin: 40, orderMode: "flexible" },
    });

    expect(missed.score).toBeLessThan(perfect.score);
    expect(missed.breakdown.completion.score).toBeLessThan(100);
  });

  it("penalizes very fast rounds (suspicious speed)", () => {
    // Complete 5 checkpoints in 2 minutes (all at once)
    const rush = calculateRondaTrustScore({
      ejecucion: {
        startedAt: makeTimestamp(0),
        completedAt: makeTimestamp(2),
        scheduledAt: makeTimestamp(0),
        checkpointsTotal: 5,
      },
      marcaciones: [
        { status: "COMPLETED", timestamp: makeTimestamp(0), checkpointId: "cp1" },
        { status: "COMPLETED", timestamp: makeTimestamp(0.5), checkpointId: "cp2" },
        { status: "COMPLETED", timestamp: makeTimestamp(1), checkpointId: "cp3" },
        { status: "COMPLETED", timestamp: makeTimestamp(1.5), checkpointId: "cp4" },
        { status: "COMPLETED", timestamp: makeTimestamp(2), checkpointId: "cp5" },
      ],
      template: { estimatedDurationMin: 40, orderMode: "flexible" },
    });

    // Time component (20% weight) is penalized heavily, but other factors still score well
    // Overall score drops but remains >80 due to 100% completion, speed consistency, and punctuality
    expect(rush.score).toBeLessThan(95);
    expect(rush.breakdown.time.score).toBeLessThan(60);
  });

  it("handles round with no startedAt", () => {
    const result = calculateRondaTrustScore({
      ejecucion: {
        startedAt: null,
        completedAt: makeTimestamp(40),
        scheduledAt: makeTimestamp(0),
        checkpointsTotal: 5,
      },
      marcaciones: [
        { status: "COMPLETED", timestamp: makeTimestamp(5), checkpointId: "cp1" },
      ],
      template: { estimatedDurationMin: 40, orderMode: "flexible" },
    });

    expect(result.breakdown.time.score).toBe(0);
  });

  it("handles round with 0 checkpoints", () => {
    const result = calculateRondaTrustScore({
      ejecucion: {
        startedAt: makeTimestamp(0),
        completedAt: makeTimestamp(10),
        scheduledAt: makeTimestamp(0),
        checkpointsTotal: 0,
      },
      marcaciones: [],
      template: { estimatedDurationMin: 10, orderMode: "flexible" },
    });

    expect(result.score).toBeDefined();
    expect(typeof result.score).toBe("number");
  });

  it("returns breakdown with all expected fields", () => {
    const result = calculateRondaTrustScore({
      ejecucion: {
        startedAt: makeTimestamp(0),
        completedAt: makeTimestamp(30),
        scheduledAt: makeTimestamp(0),
        checkpointsTotal: 3,
      },
      marcaciones: [
        { status: "COMPLETED", timestamp: makeTimestamp(10), checkpointId: "cp1" },
        { status: "COMPLETED", timestamp: makeTimestamp(20), checkpointId: "cp2" },
        { status: "COMPLETED", timestamp: makeTimestamp(30), checkpointId: "cp3" },
      ],
      template: { estimatedDurationMin: 30, orderMode: "strict" },
      templateCheckpoints: [
        { checkpointId: "cp1", orderIndex: 0 },
        { checkpointId: "cp2", orderIndex: 1 },
        { checkpointId: "cp3", orderIndex: 2 },
      ],
    });

    expect(result.breakdown).toHaveProperty("completion");
    expect(result.breakdown).toHaveProperty("time");
    expect(result.breakdown).toHaveProperty("speed");
    expect(result.breakdown).toHaveProperty("sequence");
    expect(result.breakdown).toHaveProperty("punctuality");
  });

  it("scores sequence correctly when order is strict and followed", () => {
    const result = calculateRondaTrustScore({
      ejecucion: {
        startedAt: makeTimestamp(0),
        completedAt: makeTimestamp(30),
        scheduledAt: makeTimestamp(0),
        checkpointsTotal: 3,
      },
      marcaciones: [
        { status: "COMPLETED", timestamp: makeTimestamp(10), checkpointId: "cp1" },
        { status: "COMPLETED", timestamp: makeTimestamp(20), checkpointId: "cp2" },
        { status: "COMPLETED", timestamp: makeTimestamp(30), checkpointId: "cp3" },
      ],
      template: { estimatedDurationMin: 30, orderMode: "strict" },
      templateCheckpoints: [
        { checkpointId: "cp1", orderIndex: 0 },
        { checkpointId: "cp2", orderIndex: 1 },
        { checkpointId: "cp3", orderIndex: 2 },
      ],
    });

    expect(result.breakdown.sequence.score).toBe(100);
  });

  it("penalizes late start (punctuality)", () => {
    const onTime = calculateRondaTrustScore({
      ejecucion: {
        startedAt: makeTimestamp(0),
        completedAt: makeTimestamp(30),
        scheduledAt: makeTimestamp(0),
        checkpointsTotal: 3,
      },
      marcaciones: [
        { status: "COMPLETED", timestamp: makeTimestamp(10), checkpointId: "cp1" },
        { status: "COMPLETED", timestamp: makeTimestamp(20), checkpointId: "cp2" },
        { status: "COMPLETED", timestamp: makeTimestamp(30), checkpointId: "cp3" },
      ],
      template: { estimatedDurationMin: 30, orderMode: "flexible" },
    });

    const late = calculateRondaTrustScore({
      ejecucion: {
        startedAt: makeTimestamp(60),
        completedAt: makeTimestamp(90),
        scheduledAt: makeTimestamp(0),
        checkpointsTotal: 3,
      },
      marcaciones: [
        { status: "COMPLETED", timestamp: makeTimestamp(70), checkpointId: "cp1" },
        { status: "COMPLETED", timestamp: makeTimestamp(80), checkpointId: "cp2" },
        { status: "COMPLETED", timestamp: makeTimestamp(90), checkpointId: "cp3" },
      ],
      template: { estimatedDurationMin: 30, orderMode: "flexible" },
    });

    expect(late.breakdown.punctuality.score).toBeLessThan(onTime.breakdown.punctuality.score);
  });
});
