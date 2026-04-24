/**
 * Normaliza números de teléfono para uso con wa.me.
 * Input: cualquier formato (`+56 9 1234 5678`, `9 1234 5678`, `56912345678`).
 * Output: solo dígitos con código país, sin `+`  (ej: `56912345678`).
 *
 * Si no detecta código de país, asume Chile (56).
 * TODO: leer `TenantPsychConfig.defaultCountryCode` cuando se agregue.
 */

const DEFAULT_COUNTRY = "56"; // Chile

export interface NormalizePhoneResult {
  ok: true;
  digits: string;
}

export interface NormalizePhoneError {
  ok: false;
  error: string;
}

export type NormalizePhoneOutcome = NormalizePhoneResult | NormalizePhoneError;

export function normalizePhone(raw: string | null | undefined): NormalizePhoneOutcome {
  if (!raw || !raw.trim()) {
    return { ok: false, error: "Teléfono vacío" };
  }
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 8) {
    return { ok: false, error: "Teléfono demasiado corto" };
  }
  // Si ya incluye código país válido (11-13 dígitos), usarlo tal cual.
  if (digits.length >= 11 && digits.length <= 13) {
    return { ok: true, digits };
  }
  // Asumir nacional (Chile por defecto): 8-10 dígitos → prepend 56.
  if (digits.length >= 8 && digits.length <= 10) {
    return { ok: true, digits: `${DEFAULT_COUNTRY}${digits}` };
  }
  return { ok: false, error: "Teléfono con largo inválido" };
}

/**
 * Construye una URL wa.me con texto URL-encoded.
 */
export function buildWaUrl(digits: string, text: string): string {
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
