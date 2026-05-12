/**
 * Helpers para inputs de monto CLP con separador de miles.
 *
 * - `formatCLPInput("339960")` → "339.960"
 * - `parseCLPInput("339.960")` → 339960
 * - Maneja signo negativo, vacío y entrada parcial sin perder posición de
 *   cursor (siempre que se use con onChange controlado simple).
 *
 * Decisiones:
 * - CLP no tiene decimales en uso normal, así que ignoramos comas/puntos
 *   decimales. Solo agregamos puntos como separadores de miles.
 * - Aceptamos solo dígitos (y opcional `-` al inicio). Cualquier otro
 *   caracter se descarta silenciosamente.
 */

export function formatCLPInput(raw: string): string {
  if (raw === "" || raw == null) return "";
  // Detectamos signo y normalizamos a solo dígitos.
  const isNegative = String(raw).trim().startsWith("-");
  const digits = String(raw).replace(/\D/g, "");
  if (!digits) return isNegative ? "-" : "";
  const withDots = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return isNegative ? `-${withDots}` : withDots;
}

export function parseCLPInput(raw: string): number | null {
  if (raw === "" || raw == null) return null;
  const isNegative = String(raw).trim().startsWith("-");
  const digits = String(raw).replace(/\D/g, "");
  if (!digits) return null;
  const num = parseInt(digits, 10);
  if (!Number.isFinite(num)) return null;
  return isNegative ? -num : num;
}
