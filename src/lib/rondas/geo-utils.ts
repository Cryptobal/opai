import { haversineDistance } from "@/lib/marcacion";
import { evaluateGeofenceWithTolerance } from "@/lib/rondas/geo-fence-client";

export function distanceMeters(
  fromLat: number,
  fromLng: number,
  toLat: number | null,
  toLng: number | null,
): number | null {
  if (toLat == null || toLng == null) return null;
  return haversineDistance(fromLat, fromLng, toLat, toLng);
}

export function isWithinGeoRadius(
  fromLat: number,
  fromLng: number,
  toLat: number | null,
  toLng: number | null,
  radiusM: number,
): { valid: boolean; distanceM: number | null } {
  const distanceM = distanceMeters(fromLat, fromLng, toLat, toLng);
  if (distanceM == null) {
    return { valid: false, distanceM: null };
  }
  return { valid: distanceM <= radiusM, distanceM };
}

export type GeoConfidence = "high" | "low" | "unknown";

export interface GeofenceResult {
  valid: boolean;
  distanceM: number | null;
  confidence: GeoConfidence;
}

/**
 * Validate geofence considering GPS accuracy.
 *
 * - No accuracy → standard check, confidence "unknown"
 * - Good accuracy (< radius) → tolerance = 50% of accuracy, confidence "high"
 * - Bad accuracy (>= radius) → tolerance = full accuracy, confidence "low"
 */
export function validateGeofenceWithAccuracy(
  fromLat: number,
  fromLng: number,
  toLat: number | null,
  toLng: number | null,
  radiusM: number,
  geoAccuracy: number | null | undefined,
): GeofenceResult {
  const r = evaluateGeofenceWithTolerance(
    fromLat,
    fromLng,
    toLat,
    toLng,
    radiusM,
    geoAccuracy,
  );
  return {
    valid: r.inRange,
    distanceM: r.distanceM,
    confidence: r.confidence,
  };
}

export function speedKmh(distanceM: number, elapsedSec: number): number {
  if (elapsedSec <= 0) return 0;
  return (distanceM / 1000) / (elapsedSec / 3600);
}

/**
 * Determine whether a speed calculation between two GPS points is reliable
 * enough to trigger anomaly alerts.
 *
 * Returns false (unreliable) when:
 * - GPS accuracy is poor (>30 m) — the position error alone can explain the distance
 * - The distance between points is < 150 m — GPS noise dominates at short distances
 */
const MAX_RELIABLE_ACCURACY_M = 30;
const MIN_RELIABLE_DISTANCE_M = 150;

export function isSpeedReliable(
  distanceM: number,
  gpsAccuracy: number | null | undefined,
): boolean {
  if (gpsAccuracy != null && gpsAccuracy > MAX_RELIABLE_ACCURACY_M) return false;
  if (distanceM < MIN_RELIABLE_DISTANCE_M) return false;
  return true;
}
