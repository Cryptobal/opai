import { describe, it, expect } from "vitest";
import { evaluateGeofenceWithTolerance } from "../geo-fence-client";

describe("evaluateGeofenceWithTolerance", () => {
  const lat = -33.45;
  const lng = -70.66;

  it("sin accuracy: radio efectivo = radio y confianza unknown", () => {
    const r = evaluateGeofenceWithTolerance(lat, lng, lat, lng, 30, null);
    expect(r.effectiveRadiusM).toBe(30);
    expect(r.confidence).toBe("unknown");
    expect(r.distanceM).toBe(0);
    expect(r.inRange).toBe(true);
  });

  it("accuracy >= radio: radio + accuracy completa, confianza low", () => {
    const r = evaluateGeofenceWithTolerance(lat, lng, lat, lng, 40, 100);
    expect(r.effectiveRadiusM).toBe(140);
    expect(r.confidence).toBe("low");
    expect(r.inRange).toBe(true);
  });

  it("accuracy < radio: radio + 0.5*accuracy, confianza high", () => {
    const r = evaluateGeofenceWithTolerance(lat, lng, lat, lng, 100, 40);
    expect(r.effectiveRadiusM).toBe(120);
    expect(r.confidence).toBe("high");
    expect(r.inRange).toBe(true);
  });

  it("destino null: distanceM null, inRange false", () => {
    const r = evaluateGeofenceWithTolerance(lat, lng, null, null, 50, 20);
    expect(r.distanceM).toBeNull();
    expect(r.inRange).toBe(false);
    expect(r.confidence).toBe("unknown");
  });
});
