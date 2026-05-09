/**
 * Cartola Inbox — email único por tenant para que el banco envíe la
 * cartola automáticamente vía la suscripción "Cartola por email" del
 * Office Banking.
 *
 * Formato del email:
 *   cartola+<KEY>@<DOMAIN>
 *
 * - KEY es un hash SHA256 truncado a 12 caracteres del tenantId. No es
 *   adivinable a partir del nombre del tenant; sirve para que el receptor
 *   identifique a qué tenant pertenece el mail entrante.
 * - DOMAIN se controla por la env var CARTOLA_INBOUND_DOMAIN. Por defecto
 *   "cartola.opai.cl". El operador del sistema configura los MX de ese
 *   subdominio apuntando al provider de inbound (Postmark, Mailgun,
 *   Cloudflare Email Routing, etc.) que finalmente postea al webhook
 *   /api/inbound/cartola.
 */

import crypto from "crypto";

const DEFAULT_DOMAIN = "cartola.opai.cl";

/**
 * Devuelve la KEY estable de un tenant (12 hex chars).
 */
export function tenantInboxKey(tenantId: string): string {
  return crypto
    .createHash("sha256")
    .update(`opai:cartola:${tenantId}`)
    .digest("hex")
    .slice(0, 12);
}

/**
 * Devuelve el dominio configurado para el inbox de cartolas. Si la env
 * var no está, usa el default.
 */
export function inboxDomain(): string {
  return process.env.CARTOLA_INBOUND_DOMAIN || DEFAULT_DOMAIN;
}

/**
 * Email completo de inbox de un tenant.
 * Ejemplo: cartola+gard7a3b2c4d@cartola.opai.cl
 */
export function tenantInboxEmail(tenantId: string): string {
  return `cartola+${tenantInboxKey(tenantId)}@${inboxDomain()}`;
}

/**
 * Extrae la key de un email entrante. Acepta tanto el formato plus
 * (cartola+KEY@dominio) como un local-part dotado (cartola.KEY@dominio).
 *
 * Devuelve null si el formato no calza.
 */
export function extractInboxKey(toAddress: string): string | null {
  const lower = toAddress.toLowerCase().trim();
  // cartola+KEY@anything
  const plus = lower.match(/^cartola\+([a-f0-9]{12})@/);
  if (plus) return plus[1];
  // cartola.KEY@anything (algunos providers eliminan el +)
  const dot = lower.match(/^cartola\.([a-f0-9]{12})@/);
  if (dot) return dot[1];
  return null;
}

/**
 * Verifica que la key calza con un tenantId concreto. Útil cuando
 * conocemos el tenant esperado y queremos confirmar antiembed.
 */
export function inboxKeyMatchesTenant(
  key: string,
  tenantId: string
): boolean {
  return key === tenantInboxKey(tenantId);
}
