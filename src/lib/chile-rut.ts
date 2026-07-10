/**
 * Normaliza un RUT dejando SOLO dígitos y la `K` del dígito verificador.
 * A diferencia de un `replace(/[.\-\s]/g, "")` (que solo quita puntos,
 * guiones y espacios), esto también elimina caracteres invisibles —
 * zero-width space (U+200B), BOM (U+FEFF), marcas LTR/RTL, etc.— que
 * suelen colarse en los XML del SII y rompen las comparaciones de
 * igualdad exacta (picker de cliente, validación de centro de costo).
 */
export function cleanRut(rut: string): string {
  return (rut ?? "").replace(/[^0-9kK]/g, "").toUpperCase();
}

export function formatRut(rut: string): string {
  const clean = cleanRut(rut);
  if (clean.length < 2) return rut;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  const bodyFormatted = body.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${bodyFormatted}-${dv}`;
}

/**
 * Normaliza un RUT al formato que exige el SII en el XML del DTE:
 * `<cuerpo>-<dv>` SIN puntos (máx 10 chars). El SII/SimpleAPI rechazan
 * por schema (LSX-00222 "is too long") cualquier RUT con puntos
 * (`11.111.111-1` = 13 chars). Usar SIEMPRE en el borde de envío al SII.
 */
export function toSiiRut(rut: string): string {
  const clean = cleanRut(rut);
  if (clean.length < 2) return clean;
  return `${clean.slice(0, -1)}-${clean.slice(-1)}`;
}

export function isValidRut(rut: string): boolean {
  const clean = cleanRut(rut);
  if (!/^\d{7,8}[\dK]$/.test(clean)) return false;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);

  let sum = 0;
  let multiplier = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += parseInt(body[i], 10) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }
  const rest = 11 - (sum % 11);
  const calculatedDv = rest === 11 ? "0" : rest === 10 ? "K" : String(rest);
  return calculatedDv === dv;
}
