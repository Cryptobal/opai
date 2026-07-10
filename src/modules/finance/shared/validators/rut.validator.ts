/**
 * Chilean RUT Validator
 * Validates format and check digit (digito verificador)
 */

/**
 * Clean a RUT string: keep only digits and the `K` check digit.
 * Uses `[^0-9kK]` (not `[.\-\s]`) so it also strips invisible characters
 * — zero-width space (U+200B), BOM (U+FEFF), LTR/RTL marks — that leak in
 * from SII XML and would otherwise break exact-match comparisons.
 */
export function cleanRut(rut: string): string {
  return (rut ?? "").replace(/[^0-9kK]/g, "").toUpperCase();
}

/**
 * Format a RUT to standard Chilean format: XX.XXX.XXX-X
 */
export function formatRut(rut: string): string {
  const clean = cleanRut(rut);
  if (clean.length < 2) return clean;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  const formatted = body.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${formatted}-${dv}`;
}

/**
 * Calculate the check digit (digito verificador) for a RUT body
 */
export function calculateDv(rutBody: number): string {
  let sum = 0;
  let multiplier = 2;
  let n = rutBody;

  while (n > 0) {
    sum += (n % 10) * multiplier;
    n = Math.floor(n / 10);
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }

  const remainder = 11 - (sum % 11);

  if (remainder === 11) return "0";
  if (remainder === 10) return "K";
  return String(remainder);
}

/**
 * Validate a Chilean RUT (format + check digit)
 */
export function validateRut(rut: string): { valid: boolean; error?: string } {
  const clean = cleanRut(rut);

  if (clean.length < 2) {
    return { valid: false, error: "RUT demasiado corto" };
  }

  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);

  // Body must be numeric
  if (!/^\d+$/.test(body)) {
    return { valid: false, error: "RUT contiene caracteres invalidos" };
  }

  const rutNumber = parseInt(body, 10);
  if (rutNumber < 1000000 || rutNumber > 99999999) {
    return { valid: false, error: "RUT fuera de rango valido" };
  }

  const expectedDv = calculateDv(rutNumber);
  if (dv !== expectedDv) {
    return { valid: false, error: "Digito verificador incorrecto" };
  }

  return { valid: true };
}
