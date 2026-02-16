/**
 * Parsea URLs de Google Maps y extrae coordenadas lat/lng.
 * Soporta formatos:
 * - !3dLAT!4dLNG (coordenadas exactas del lugar)
 * - @LAT,LNG (centro del mapa)
 * - ?q=LAT,LNG (query con coordenadas, típico de enlaces cortos resueltos)
 * - /maps?ll=LAT,LNG
 */
export function parseGoogleMapsUrl(url: string): { lat: number; lng: number } | null {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();
  if (!/google\.com\/maps/i.test(trimmed) && !/maps\.google\.com/i.test(trimmed)) return null;

  function tryParse(lat: string, lng: string): { lat: number; lng: number } | null {
    const la = parseFloat(lat);
    const ln = parseFloat(lng);
    if (Number.isFinite(la) && Number.isFinite(ln) && Math.abs(la) <= 90 && Math.abs(ln) <= 180) {
      return { lat: la, lng: ln };
    }
    return null;
  }

  // 1. Coordenadas exactas del lugar: !3dLAT!4dLNG
  const dataMatch = trimmed.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (dataMatch) {
    const r = tryParse(dataMatch[1], dataMatch[2]);
    if (r) return r;
  }

  // 2. Centro del mapa: @LAT,LNG
  const atMatch = trimmed.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (atMatch) {
    const r = tryParse(atMatch[1], atMatch[2]);
    if (r) return r;
  }

  // 3. Query param: ?q=LAT,LNG o &q=LAT,LNG (enlaces cortos resueltos)
  const qMatch = trimmed.match(/[?&]q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (qMatch) {
    const r = tryParse(qMatch[1], qMatch[2]);
    if (r) return r;
  }

  // 4. Query param: ?ll=LAT,LNG
  const llMatch = trimmed.match(/[?&]ll=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (llMatch) {
    const r = tryParse(llMatch[1], llMatch[2]);
    if (r) return r;
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
