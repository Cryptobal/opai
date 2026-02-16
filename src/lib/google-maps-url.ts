/**
 * Parsea URLs de Google Maps y extrae coordenadas lat/lng.
 * Solo URLs largas (google.com/maps); enlaces cortos (goo.gl, maps.app.goo.gl) no tienen coords en la URL.
 * Soporta formatos:
 * - !3dLAT!4dLNG (coordenadas exactas del lugar)
 * - @LAT,LNG (centro del mapa)
 */
export function parseGoogleMapsUrl(url: string): { lat: number; lng: number } | null {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();
  // Solo parsear URLs largas; las cortas se resuelven en el servidor
  if (!/google\.com\/maps/i.test(trimmed) && !/maps\.google\.com/i.test(trimmed)) return null;

  // Preferir coordenadas exactas del lugar: !3dLAT!4dLNG
  const dataMatch = trimmed.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (dataMatch) {
    const lat = parseFloat(dataMatch[1]);
    const lng = parseFloat(dataMatch[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }

  // Fallback: centro del mapa @LAT,LNG
  const atMatch = trimmed.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (atMatch) {
    const lat = parseFloat(atMatch[1]);
    const lng = parseFloat(atMatch[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }

  return null;
}

/** Acepta URLs largas (google.com/maps) y enlaces cortos (maps.app.goo.gl, goo.gl/maps). */
export function isGoogleMapsUrl(value: string): boolean {
  const v = (value || "").trim();
  return (
    /google\.com\/maps/i.test(v) ||
    /maps\.google\.com/i.test(v) ||
    /maps\.app\.goo\.gl/i.test(v) ||
    /goo\.gl\/maps/i.test(v)
  );
}
