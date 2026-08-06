/**
 * Helpers de dirección georreferenciada para instalaciones CRM.
 * Misma regla que personas: la dirección debe venir de Google Maps (coords válidas).
 */

export function hasValidInstallationCoords(
  lat: number | null | undefined,
  lng: number | null | undefined
): boolean {
  if (lat == null || lng == null) return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat === 0 && lng === 0) return false;
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

/** Si hay texto de dirección, exige coordenadas de Google Maps. */
export function validateGeoreferencedAddress(opts: {
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
}): string | null {
  const address = opts.address?.trim() ?? "";
  if (!address) return null;
  if (!hasValidInstallationCoords(opts.lat, opts.lng)) {
    return "Debes seleccionar la dirección desde Google Maps";
  }
  return null;
}
