// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  distanceMeters,
  isWithinGeoRadius,
  validateGeofenceWithAccuracy,
  speedKmh,
  isSpeedReliable,
} from "../geo-utils";

// Coordinates: Santiago, Chile — Condominio la Florida area
const SANTIAGO_LAT = -33.5206;
const SANTIAGO_LNG = -70.6134;

// ~100m away from SANTIAGO
const NEAR_LAT = -33.5215;
const NEAR_LNG = -70.6134;

// ~5km away
const FAR_LAT = -33.56;
const FAR_LNG = -70.62;

describe("distanceMeters", () => {
  it("returns null when target coords are null", () => {
    expect(distanceMeters(SANTIAGO_LAT, SANTIAGO_LNG, null, null)).toBeNull();
    expect(distanceMeters(SANTIAGO_LAT, SANTIAGO_LNG, SANTIAGO_LAT, null)).toBeNull();
    expect(distanceMeters(SANTIAGO_LAT, SANTIAGO_LNG, null, SANTIAGO_LNG)).toBeNull();
  });

  it("returns 0 for same coordinates", () => {
    expect(distanceMeters(SANTIAGO_LAT, SANTIAGO_LNG, SANTIAGO_LAT, SANTIAGO_LNG)).toBe(0);
  });

  it("returns positive distance for different coordinates", () => {
    const d = distanceMeters(SANTIAGO_LAT, SANTIAGO_LNG, NEAR_LAT, NEAR_LNG);
    expect(d).not.toBeNull();
    expect(d!).toBeGreaterThan(50);
    expect(d!).toBeLessThan(200);
  });

  it("returns larger distance for farther coordinates", () => {
    const near = distanceMeters(SANTIAGO_LAT, SANTIAGO_LNG, NEAR_LAT, NEAR_LNG)!;
    const far = distanceMeters(SANTIAGO_LAT, SANTIAGO_LNG, FAR_LAT, FAR_LNG)!;
    expect(far).toBeGreaterThan(near);
    expect(far).toBeGreaterThan(3000);
  });
});

describe("isWithinGeoRadius", () => {
  it("returns valid=true when within radius", () => {
    const result = isWithinGeoRadius(SANTIAGO_LAT, SANTIAGO_LNG, NEAR_LAT, NEAR_LNG, 200);
    expect(result.valid).toBe(true);
    expect(result.distanceM).toBeGreaterThan(0);
  });

  it("returns valid=false when outside radius", () => {
    const result = isWithinGeoRadius(SANTIAGO_LAT, SANTIAGO_LNG, FAR_LAT, FAR_LNG, 100);
    expect(result.valid).toBe(false);
    expect(result.distanceM).toBeGreaterThan(100);
  });

  it("returns valid=false and distanceM=null for null coords", () => {
    const result = isWithinGeoRadius(SANTIAGO_LAT, SANTIAGO_LNG, null, null, 100);
    expect(result.valid).toBe(false);
    expect(result.distanceM).toBeNull();
  });

  it("returns valid=true for same point with any radius", () => {
    const result = isWithinGeoRadius(SANTIAGO_LAT, SANTIAGO_LNG, SANTIAGO_LAT, SANTIAGO_LNG, 1);
    expect(result.valid).toBe(true);
    expect(result.distanceM).toBe(0);
  });
});

describe("validateGeofenceWithAccuracy", () => {
  it("returns confidence=unknown when no accuracy provided", () => {
    const result = validateGeofenceWithAccuracy(
      SANTIAGO_LAT, SANTIAGO_LNG, NEAR_LAT, NEAR_LNG, 200, null,
    );
    expect(result.confidence).toBe("unknown");
    expect(result.valid).toBe(true);
  });

  it("returns confidence=unknown when accuracy is 0", () => {
    const result = validateGeofenceWithAccuracy(
      SANTIAGO_LAT, SANTIAGO_LNG, NEAR_LAT, NEAR_LNG, 200, 0,
    );
    expect(result.confidence).toBe("unknown");
  });

  it("returns confidence=high when accuracy < radius", () => {
    const result = validateGeofenceWithAccuracy(
      SANTIAGO_LAT, SANTIAGO_LNG, NEAR_LAT, NEAR_LNG, 200, 10,
    );
    expect(result.confidence).toBe("high");
    expect(result.valid).toBe(true);
  });

  it("applies 50% accuracy tolerance for high-confidence checks", () => {
    // Point is ~100m away, radius is 90m, accuracy is 30m
    // With high confidence: valid if distance <= 90 + 30*0.5 = 105m
    const result = validateGeofenceWithAccuracy(
      SANTIAGO_LAT, SANTIAGO_LNG, NEAR_LAT, NEAR_LNG, 90, 30,
    );
    expect(result.confidence).toBe("high");
    // Distance is ~100m, threshold is 90 + 15 = 105m → should be valid
    expect(result.valid).toBe(true);
  });

  it("returns confidence=low when accuracy >= radius", () => {
    const result = validateGeofenceWithAccuracy(
      SANTIAGO_LAT, SANTIAGO_LNG, NEAR_LAT, NEAR_LNG, 20, 50,
    );
    expect(result.confidence).toBe("low");
  });

  it("applies full accuracy tolerance for low-confidence checks", () => {
    // Point is ~100m away, radius is 20m, accuracy is 50m
    // Low confidence: valid if distance <= 20 + 50 = 70m → NOT valid (100 > 70)
    const result = validateGeofenceWithAccuracy(
      SANTIAGO_LAT, SANTIAGO_LNG, NEAR_LAT, NEAR_LNG, 20, 50,
    );
    expect(result.valid).toBe(false);
  });

  it("returns null coords correctly", () => {
    const result = validateGeofenceWithAccuracy(
      SANTIAGO_LAT, SANTIAGO_LNG, null, null, 100, 10,
    );
    expect(result.valid).toBe(false);
    expect(result.distanceM).toBeNull();
    expect(result.confidence).toBe("unknown");
  });
});

describe("speedKmh", () => {
  it("returns 0 when elapsed time is 0", () => {
    expect(speedKmh(1000, 0)).toBe(0);
  });

  it("returns 0 when elapsed time is negative", () => {
    expect(speedKmh(1000, -5)).toBe(0);
  });

  it("calculates correct speed for 1km in 1 hour", () => {
    const speed = speedKmh(1000, 3600);
    expect(speed).toBeCloseTo(1, 1);
  });

  it("calculates correct speed for 100m in 60 seconds (6 km/h walking)", () => {
    const speed = speedKmh(100, 60);
    expect(speed).toBeCloseTo(6, 1);
  });

  it("calculates high speed for teleportation-like movement", () => {
    // 5000m in 10 seconds = 1800 km/h
    const speed = speedKmh(5000, 10);
    expect(speed).toBe(1800);
  });
});

describe("isSpeedReliable", () => {
  it("returns true for good accuracy and sufficient distance", () => {
    expect(isSpeedReliable(200, 10)).toBe(true);
  });

  it("returns false when accuracy exceeds 30m", () => {
    expect(isSpeedReliable(200, 31)).toBe(false);
    expect(isSpeedReliable(200, 50)).toBe(false);
  });

  it("returns false when distance is less than 150m", () => {
    expect(isSpeedReliable(149, 10)).toBe(false);
    expect(isSpeedReliable(100, 5)).toBe(false);
  });

  it("returns true when accuracy is null (unknown)", () => {
    expect(isSpeedReliable(200, null)).toBe(true);
  });

  it("returns true when accuracy is undefined", () => {
    expect(isSpeedReliable(200, undefined)).toBe(true);
  });

  it("returns false when both conditions fail", () => {
    expect(isSpeedReliable(50, 100)).toBe(false);
  });
});
