/**
 * Geocerca pura (client + server). No importa módulos Node.
 * Debe coincidir con validateGeofenceWithAccuracy en geo-utils.ts.
 */

export type GeoFenceConfidence = "high" | "low" | "unknown";

export interface GeofenceToleranceResult {
  distanceM: number | null;
  effectiveRadiusM: number;
  inRange: boolean;
  confidence: GeoFenceConfidence;
}

function haversineDistanceM(
  lat1: number,
  lng1: number,
  lat2: number | null,
  lng2: number | null,
): number | null {
  if (lat2 == null || lng2 == null) return null;
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Evalúa si una posición está dentro del radio efectivo (radio + tolerancia por accuracy GPS).
 * Misma regla que validateGeofenceWithAccuracy en geo-utils.
 */
export function evaluateGeofenceWithTolerance(
  fromLat: number,
  fromLng: number,
  toLat: number | null,
  toLng: number | null,
  radiusM: number,
  geoAccuracy: number | null | undefined,
): GeofenceToleranceResult {
  const distanceM = haversineDistanceM(fromLat, fromLng, toLat, toLng);

  if (distanceM == null) {
    const effectiveRadiusM =
      geoAccuracy == null || geoAccuracy <= 0
        ? radiusM
        : geoAccuracy >= radiusM
          ? radiusM + geoAccuracy
          : radiusM + geoAccuracy * 0.5;
    return {
      distanceM: null,
      effectiveRadiusM,
      inRange: false,
      confidence: "unknown",
    };
  }

  if (geoAccuracy == null || geoAccuracy <= 0) {
    const effectiveRadiusM = radiusM;
    return {
      distanceM,
      effectiveRadiusM,
      inRange: distanceM != null && distanceM <= effectiveRadiusM,
      confidence: "unknown",
    };
  }

  if (geoAccuracy >= radiusM) {
    const effectiveRadiusM = radiusM + geoAccuracy;
    return {
      distanceM,
      effectiveRadiusM,
      inRange: distanceM != null && distanceM <= effectiveRadiusM,
      confidence: "low",
    };
  }

  const effectiveRadiusM = radiusM + geoAccuracy * 0.5;
  return {
    distanceM,
    effectiveRadiusM,
    inRange: distanceM != null && distanceM <= effectiveRadiusM,
    confidence: "high",
  };
}
