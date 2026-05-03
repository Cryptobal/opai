import { randomBytes } from "crypto";

/**
 * Genera un token URL-safe de 32 caracteres (24 bytes b64url).
 * Se usa para CSAT y, eventualmente, para portal externo de tickets.
 */
export function generateCsatToken(): string {
  return randomBytes(24).toString("base64url");
}

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
