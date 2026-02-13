import { haversineDistance } from "@/lib/marcacion";

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

export function speedKmh(distanceM: number, elapsedSec: number): number {
  if (elapsedSec <= 0) return 0;
  return (distanceM / 1000) / (elapsedSec / 3600);
}
