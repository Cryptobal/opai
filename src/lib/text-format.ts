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

