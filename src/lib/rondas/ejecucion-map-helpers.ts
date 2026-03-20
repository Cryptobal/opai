export function asWalkRoute(json: unknown): Array<{ lat: number; lng: number }> | null {
  if (!json || !Array.isArray(json)) return null;
  const pts: Array<{ lat: number; lng: number }> = [];
  for (const p of json) {
    if (!p || typeof p !== "object") continue;
    const o = p as Record<string, unknown>;
    const lat = Number(o.lat);
    const lng = Number(o.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) pts.push({ lat, lng });
  }
  return pts.length > 0 ? pts : null;
}

export function asRouteSnapshot(
  json: unknown,
): Array<{ id: string; name: string; lat: number; lng: number; orderIndex: number; status: string }> | null {
  if (!json || !Array.isArray(json)) return null;
  const out: Array<{ id: string; name: string; lat: number; lng: number; orderIndex: number; status: string }> =
    [];
  for (const row of json) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const lat = Number(r.lat);
    const lng = Number(r.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    out.push({
      id: String(r.id ?? ""),
      name: String(r.name ?? ""),
      lat,
      lng,
      orderIndex: Number.isFinite(Number(r.orderIndex)) ? Number(r.orderIndex) : 0,
      status: String(r.status ?? "pending"),
    });
  }
  return out.length > 0 ? out : null;
}
