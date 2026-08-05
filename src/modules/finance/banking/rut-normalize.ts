/**
 * Normalización / heurísticas de RUT para match bancario.
 * Puro (sin prisma / server-only) — usable desde Client Components
 * vía `rut-extract` → `unmatched-count` → planilla.
 */

/**
 * Limpia un RUT chileno a su forma canónica para comparar (solo dígitos
 * y dígito verificador, sin puntos ni guion). Si el input no es válido,
 * devuelve "" en vez de null para simplificar el caller.
 */
export function normalizeRutForMatch(rut: string | null | undefined): string {
  if (!rut) return "";
  return rut.replace(/[^0-9kK]/g, "").toLowerCase();
}

/**
 * Detecta si el RUT del receptor aparece "embebido" en el texto del
 * banco. Bancos chilenos suelen incluir el RUT del pagador o el folio
 * en la descripción. Aceptamos formato con o sin puntos/guion: tanto
 * "12345678-5" como "12.345.678-5" como "123456785" matchean.
 */
export function rutAppearsInText(
  rut: string | null | undefined,
  ...texts: (string | null | undefined)[]
): boolean {
  const norm = normalizeRutForMatch(rut);
  if (norm.length < 7) return false; // RUT chileno mínimo 7 chars
  for (const t of texts) {
    if (!t) continue;
    const tnorm = t.replace(/[^0-9kK]/g, "").toLowerCase();
    if (tnorm.includes(norm)) return true;
  }
  return false;
}

/**
 * Heurística para distinguir RUT de persona natural (guardias) frente a
 * societarios en glosas bancarias: el cuerpo numérico (sin dígito verificador)
 * típicamente queda bajo ~30M.
 */
export function isNaturalPersonRutBody(rut: string | null | undefined): boolean {
  const norm = normalizeRutForMatch(rut);
  if (norm.length < 2) return false;
  const bodyStr = norm.slice(0, -1);
  const body = parseInt(bodyStr, 10);
  if (!Number.isFinite(body) || body <= 0) return false;
  return body < 30_000_000;
}
