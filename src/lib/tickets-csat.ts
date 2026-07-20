import { randomBytes } from "crypto";

/**
 * Genera un token URL-safe de 32 caracteres (24 bytes b64url).
 * Se usa para CSAT y, eventualmente, para portal externo de tickets.
 */
export function generateCsatToken(): string {
  return randomBytes(24).toString("base64url");
}

/**
 * Alias semántico de `generateCsatToken` para el portal externo de cobro
 * (landing pública /cobro/[token]). Mismo esquema: 24 bytes base64url,
 * URL-safe, imposible de adivinar. Se reutiliza el mismo helper para no
 * duplicar la generación de tokens públicos.
 */
export const generatePublicActionToken = generateCsatToken;

/**
 * Por defecto el token expira a 30 días post-resolución. Suficiente para
 * que el cliente conteste sin ser eterno (evita votos artificialmente
 * tardíos que distorsionen el dashboard).
 */
export function defaultCsatExpiry(now: Date = new Date()): Date {
  const d = new Date(now);
  d.setDate(d.getDate() + 30);
  return d;
}
