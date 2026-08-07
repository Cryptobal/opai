/**
 * Normaliza el payload leído de un QR de checkpoint.
 *
 * Los stickers actuales codifican el código plano (ej. "UJC57MR4"), pero
 * aceptamos también URLs o texto con el código embebido para no obligar a
 * reimprimir si algún lote viejo/nuevo incluye un link.
 */
export function normalizeCheckpointQrCode(raw: string | null | undefined): string {
  if (raw == null) return "";
  const trimmed = String(raw).trim();
  if (!trimmed) return "";

  // URL completa → tomar último segmento del path (sin query/hash)
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      const segments = url.pathname.split("/").filter(Boolean);
      const last = segments[segments.length - 1] ?? "";
      const candidate = decodeURIComponent(last).trim();
      if (candidate) return candidate.toUpperCase();
    } catch {
      // fall through to generic cleanup
    }
  }

  // "codigo: XYZ" / "qr=XYZ" / path relativo "/ronda/XYZ"
  const pathMatch = trimmed.match(/\/(?:ronda|checkpoint|qr)\/([^/?#\s]+)/i);
  if (pathMatch?.[1]) {
    return decodeURIComponent(pathMatch[1]).trim().toUpperCase();
  }

  const kvMatch = trimmed.match(/(?:^|[?&#\s])(?:code|qr|qrCode|checkpoint)=([^&#\s]+)/i);
  if (kvMatch?.[1]) {
    return decodeURIComponent(kvMatch[1]).trim().toUpperCase();
  }

  return trimmed.toUpperCase();
}

/** Compara dos códigos QR de checkpoint ignorando formato de empaquetado. */
export function checkpointQrCodesMatch(
  scanned: string | null | undefined,
  expected: string | null | undefined,
): boolean {
  const a = normalizeCheckpointQrCode(scanned);
  const b = normalizeCheckpointQrCode(expected);
  return a.length > 0 && b.length > 0 && a === b;
}
