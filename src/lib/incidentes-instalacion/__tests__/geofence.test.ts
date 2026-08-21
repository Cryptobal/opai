// @vitest-environment node
import { describe, expect, it } from "vitest";
import { checkGeofence, effectiveGeofenceRadiusM } from "../geofence";

const SANTIAGO = { lat: -33.4372, lng: -70.6506, geoRadiusM: 100 };

describe("effectiveGeofenceRadiusM", () => {
  it("usa 1000 m si el radio es nulo o inválido", () => {
    expect(effectiveGeofenceRadiusM(null, 0)).toBe(1000);
    expect(effectiveGeofenceRadiusM(0, 0)).toBe(1000);
  });

  it("suma accuracy capada a 150 m", () => {
    expect(effectiveGeofenceRadiusM(100, 20)).toBe(120);
    expect(effectiveGeofenceRadiusM(100, 400)).toBe(250);
    expect(effectiveGeofenceRadiusM(100, null)).toBe(100);
  });
});

describe("checkGeofence", () => {
  it("exige GPS", () => {
    const r = checkGeofence(SANTIAGO, null, null, 10);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("GPS_REQUIRED");
  });

  it("falla si la instalación no tiene coordenadas", () => {
    const r = checkGeofence({ lat: null, lng: null, geoRadiusM: 100 }, -33.4, -70.6, 5);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("NO_COORDS");
  });

  it("acepta un punto dentro del radio", () => {
    const r = checkGeofence(SANTIAGO, SANTIAGO.lat, SANTIAGO.lng, 5);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.distanceM).toBeLessThan(1);
  });

  it("acepta el borde con accuracy", () => {
    // ~111 m al norte (~0.001 deg lat)
    const north = SANTIAGO.lat + 0.001;
    const withoutAcc = checkGeofence(SANTIAGO, north, SANTIAGO.lng, 0);
    expect(withoutAcc.ok).toBe(false);
    const withAcc = checkGeofence(SANTIAGO, north, SANTIAGO.lng, 50);
    expect(withAcc.ok).toBe(true);
  });

  it("rechaza fuera de radio", () => {
    const far = checkGeofence(SANTIAGO, SANTIAGO.lat + 0.05, SANTIAGO.lng, 10);
    expect(far.ok).toBe(false);
    if (!far.ok) expect(far.code).toBe("OUT_OF_RANGE");
  });
});
