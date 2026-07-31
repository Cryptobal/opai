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

/** Tope máximo de tolerancia por precisión GPS (m). Ninguna geocerca efectiva supera radio + este valor. */
export const GEOFENCE_MAX_ACCURACY_TOLERANCE_M = 30;

const INVALID_ACCURACY_SENTINEL = 999_999;

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

function isInvalidAccuracy(geoAccuracy: number | null | undefined): boolean {
  return (
    geoAccuracy == null ||
    !Number.isFinite(geoAccuracy) ||
    geoAccuracy <= 0 ||
    geoAccuracy >= INVALID_ACCURACY_SENTINEL
  );
}

function computeEffectiveRadius(
  radiusM: number,
  geoAccuracy: number | null | undefined,
): { effectiveRadiusM: number; confidence: GeoFenceConfidence } {
  if (isInvalidAccuracy(geoAccuracy)) {
    return {
      effectiveRadiusM: radiusM + GEOFENCE_MAX_ACCURACY_TOLERANCE_M,
      confidence: "unknown",
    };
  }

  const acc = geoAccuracy as number;
  if (acc >= radiusM) {
    const tol = Math.min(acc, GEOFENCE_MAX_ACCURACY_TOLERANCE_M);
    return {
      effectiveRadiusM: radiusM + tol,
      confidence: "low",
    };
  }

  const tol = Math.min(acc * 0.5, GEOFENCE_MAX_ACCURACY_TOLERANCE_M);
  return {
    effectiveRadiusM: radiusM + tol,
    confidence: "high",
  };
}

/**
 * Evalúa si una posición está dentro del radio efectivo (radio + tolerancia por accuracy GPS).
 * Misma regla que validateGeofenceWithAccuracy en geo-utils.
 *
 * Checkpoints sin coordenadas (toLat/toLng null): no hay geocerca que evaluar — inRange=true
 * para no bloquear marcación (p. ej. puntos QR-only en interiores).
 */
export function evaluateGeofenceWithTolerance(
  fromLat: number,
  fromLng: number,
  toLat: number | null,
  toLng: number | null,
  radiusM: number,
  geoAccuracy: number | null | undefined,
): GeofenceToleranceResult {
  const { effectiveRadiusM, confidence } = computeEffectiveRadius(radiusM, geoAccuracy);
  const distanceM = haversineDistanceM(fromLat, fromLng, toLat, toLng);

  if (distanceM == null) {
    return {
      distanceM: null,
      effectiveRadiusM,
      inRange: true,
      confidence,
    };
  }

  return {
    distanceM,
    effectiveRadiusM,
    inRange: distanceM <= effectiveRadiusM,
    confidence,
  };
}
