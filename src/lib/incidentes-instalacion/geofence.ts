import { haversineDistance } from "@/lib/marcacion";
import { MAX_ACCURACY_BONUS_M } from "./constants";

export type GeofenceInstallation = {
  lat: number | null;
  lng: number | null;
  geoRadiusM: number | null;
};

export type GeofenceResult =
  | { ok: true; distanceM: number; effectiveRadiusM: number }
  | {
      ok: false;
      code: "GPS_REQUIRED" | "OUT_OF_RANGE" | "NO_COORDS";
      distanceM: number | null;
      effectiveRadiusM: number | null;
    };

export function effectiveGeofenceRadiusM(
  geoRadiusM: number | null | undefined,
  accuracy: number | null | undefined,
): number {
  const base = Number.isFinite(geoRadiusM) && (geoRadiusM ?? 0) > 0 ? Number(geoRadiusM) : 1000;
  const acc = Number.isFinite(accuracy) && (accuracy ?? 0) > 0 ? Number(accuracy) : 0;
  return base + Math.min(acc, MAX_ACCURACY_BONUS_M);
}

export function checkGeofence(
  installation: GeofenceInstallation,
  lat: number | null | undefined,
  lng: number | null | undefined,
  accuracy?: number | null,
): GeofenceResult {
  if (
    installation.lat == null ||
    installation.lng == null ||
    !Number.isFinite(installation.lat) ||
    !Number.isFinite(installation.lng)
  ) {
    return { ok: false, code: "NO_COORDS", distanceM: null, effectiveRadiusM: null };
  }
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: false, code: "GPS_REQUIRED", distanceM: null, effectiveRadiusM: null };
  }
  const effectiveRadiusM = effectiveGeofenceRadiusM(installation.geoRadiusM, accuracy);
  const distanceM = haversineDistance(lat, lng, installation.lat, installation.lng);
  if (distanceM > effectiveRadiusM) {
    return { ok: false, code: "OUT_OF_RANGE", distanceM, effectiveRadiusM };
  }
  return { ok: true, distanceM, effectiveRadiusM };
}
