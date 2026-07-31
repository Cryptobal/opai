import { describe, it, expect } from "vitest";
import {
  evaluateGeofenceWithTolerance,
  GEOFENCE_MAX_ACCURACY_TOLERANCE_M,
} from "../geo-fence-client";

describe("evaluateGeofenceWithTolerance", () => {
  const lat = -33.45;
  const lng = -70.66;

  it("sin accuracy: radio efectivo = radio + 30, confianza unknown", () => {
    const r = evaluateGeofenceWithTolerance(lat, lng, lat, lng, 30, null);
    expect(r.effectiveRadiusM).toBe(30 + GEOFENCE_MAX_ACCURACY_TOLERANCE_M);
    expect(r.confidence).toBe("unknown");
    expect(r.distanceM).toBe(0);
    expect(r.inRange).toBe(true);
  });

  it("accuracy >= radio: tolerancia acotada a 30m, confianza low", () => {
    const r = evaluateGeofenceWithTolerance(lat, lng, lat, lng, 40, 100);
    expect(r.effectiveRadiusM).toBe(40 + GEOFENCE_MAX_ACCURACY_TOLERANCE_M);
    expect(r.confidence).toBe("low");
    expect(r.inRange).toBe(true);
  });

  it("radio 5 / accuracy 800: efectivo 35, no 805", () => {
    const r = evaluateGeofenceWithTolerance(lat, lng, lat, lng, 5, 800);
    expect(r.effectiveRadiusM).toBe(5 + GEOFENCE_MAX_ACCURACY_TOLERANCE_M);
    expect(r.confidence).toBe("low");
    expect(r.inRange).toBe(true);
  });

  it("accuracy < radio: radio + min(0.5*accuracy, 30), confianza high", () => {
    const r = evaluateGeofenceWithTolerance(lat, lng, lat, lng, 100, 40);
    expect(r.effectiveRadiusM).toBe(120);
    expect(r.confidence).toBe("high");
    expect(r.inRange).toBe(true);
  });

  it("accuracy inválida (sentinel): radio + 30", () => {
    const r = evaluateGeofenceWithTolerance(lat, lng, lat, lng, 50, 999_999);
    expect(r.effectiveRadiusM).toBe(50 + GEOFENCE_MAX_ACCURACY_TOLERANCE_M);
    expect(r.confidence).toBe("unknown");
  });

  it("destino null: distanceM null, inRange true (sin geocerca)", () => {
    const r = evaluateGeofenceWithTolerance(lat, lng, null, null, 50, 20);
    expect(r.distanceM).toBeNull();
    expect(r.inRange).toBe(true);
    expect(r.confidence).toBe("high");
  });

  it("punto lejano con accuracy mala no entra con tolerancia acotada", () => {
    const farLat = lat - 0.01; // ~1.1 km
    const r = evaluateGeofenceWithTolerance(lat, lng, farLat, lng, 5, 800);
    expect(r.effectiveRadiusM).toBe(35);
    expect(r.inRange).toBe(false);
  });
});
