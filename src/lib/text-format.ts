/**
 * Utilidades de formato de texto para CRM.
 */

const ES_LOCALE = "es-CL";

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Convierte texto a formato: Primera letra mayúscula y resto minúscula.
 * Ej: "jUAN pEREZ" -> "Juan perez"
 */
export function toSentenceCase(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const clean = normalizeWhitespace(value);
  if (!clean) return null;
  const lowered = clean.toLocaleLowerCase(ES_LOCALE);
  return `${lowered.charAt(0).toLocaleUpperCase(ES_LOCALE)}${lowered.slice(1)}`;
}

/**
 * Convierte cada palabra a formato: Primera letra mayúscula y resto minúscula.
 * Ej: "SICE AGENCIA CHILE" -> "Sice agencia chile"
 */
export function toSentenceCaseWords(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const clean = normalizeWhitespace(value);
  if (!clean) return null;
  return clean
    .toLocaleLowerCase(ES_LOCALE)
    .split(/\s+/)
    .map((w) => `${w.charAt(0).toLocaleUpperCase(ES_LOCALE)}${w.slice(1)}`)
    .join(" ");
}

/**
 * Normaliza teléfono chileno a formato +56962373606
 * (código país +56 + 9 dígitos móvil).
 */
export function formatChileanPhone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const digits = value.replace(/\D/g, "");
  if (!digits) return null;
  if (/^569\d{8}$/.test(digits)) return `+${digits}`;
  if (/^56\d{9}$/.test(digits)) return `+${digits}`;
  if (/^9\d{8}$/.test(digits)) return `+56${digits}`;
  return null;
}

