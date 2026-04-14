// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

// Mock ia-config to avoid Prisma import chain (ia-config → alert-config-service → prisma)
vi.mock("../ia-config", () => ({
  DEFAULT_SPEED_THRESHOLD_KMH: 30,
}));

import { detectCheckpointAnomalies, type RondaAnomalyCode } from "../anomaly-detection";

describe("detectCheckpointAnomalies", () => {
  it("returns empty array when no anomalies", () => {
    const result = detectCheckpointAnomalies({
      speedFromPrevKmh: 5,
      batteryLevel: 80,
      prevBatteryLevel: 85,
    });
    expect(result).toEqual([]);
  });

  it("detects velocidad_anomala when speed exceeds default threshold (30 km/h)", () => {
    const result = detectCheckpointAnomalies({
      speedFromPrevKmh: 35,
    });
    expect(result).toContain("velocidad_anomala");
  });

  it("does not flag speed at exactly the threshold", () => {
    const result = detectCheckpointAnomalies({
      speedFromPrevKmh: 30,
    });
    expect(result).not.toContain("velocidad_anomala");
  });

  it("respects custom speed threshold", () => {
    const result = detectCheckpointAnomalies({
      speedFromPrevKmh: 15,
      speedThresholdKmh: 10,
    });
    expect(result).toContain("velocidad_anomala");
  });

  it("detects bateria_baja when battery <= 10%", () => {
    const result = detectCheckpointAnomalies({
      batteryLevel: 10,
    });
    expect(result).toContain("bateria_baja");
  });

  it("detects bateria_baja when battery is 0%", () => {
    const result = detectCheckpointAnomalies({
      batteryLevel: 0,
    });
    expect(result).toContain("bateria_baja");
  });

  it("does not flag battery at 11%", () => {
    const result = detectCheckpointAnomalies({
      batteryLevel: 11,
    });
    expect(result).not.toContain("bateria_baja");
  });

  it("respects custom battery threshold", () => {
    const result = detectCheckpointAnomalies({
      batteryLevel: 20,
      batteryLowThreshold: 25,
    });
    expect(result).toContain("bateria_baja");
  });

  it("detects bateria_estatica when battery unchanged for >10 minutes", () => {
    const result = detectCheckpointAnomalies({
      batteryLevel: 75,
      prevBatteryLevel: 75,
      elapsedMinutes: 15,
    });
    expect(result).toContain("bateria_estatica");
  });

  it("does not flag static battery when levels differ", () => {
    const result = detectCheckpointAnomalies({
      batteryLevel: 74,
      prevBatteryLevel: 75,
      elapsedMinutes: 15,
    });
    expect(result).not.toContain("bateria_estatica");
  });

  it("does not flag static battery when elapsed time is short", () => {
    const result = detectCheckpointAnomalies({
      batteryLevel: 75,
      prevBatteryLevel: 75,
      elapsedMinutes: 5,
    });
    expect(result).not.toContain("bateria_estatica");
  });

  it("respects custom static battery minutes threshold", () => {
    const result = detectCheckpointAnomalies({
      batteryLevel: 75,
      prevBatteryLevel: 75,
      elapsedMinutes: 6,
      batteryStaticMinMinutes: 5,
    });
    expect(result).toContain("bateria_estatica");
  });

  it("can detect multiple anomalies simultaneously", () => {
    const result = detectCheckpointAnomalies({
      speedFromPrevKmh: 50,
      batteryLevel: 5,
      prevBatteryLevel: 5,
      elapsedMinutes: 20,
    });
    expect(result).toContain("velocidad_anomala");
    expect(result).toContain("bateria_baja");
    expect(result).toContain("bateria_estatica");
    expect(result).toHaveLength(3);
  });

  it("handles null/undefined inputs gracefully", () => {
    const result = detectCheckpointAnomalies({});
    expect(result).toEqual([]);
  });

  it("handles null speed as 0", () => {
    const result = detectCheckpointAnomalies({
      speedFromPrevKmh: null,
    });
    expect(result).not.toContain("velocidad_anomala");
  });

  it("handles null battery as 100", () => {
    const result = detectCheckpointAnomalies({
      batteryLevel: null,
    });
    expect(result).not.toContain("bateria_baja");
  });

  it("does not flag static battery when prev is null", () => {
    const result = detectCheckpointAnomalies({
      batteryLevel: 75,
      prevBatteryLevel: null,
      elapsedMinutes: 60,
    });
    expect(result).not.toContain("bateria_estatica");
  });
});
