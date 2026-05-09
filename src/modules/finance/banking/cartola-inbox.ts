/**
 * Cartola Inbox — email único por tenant para que el banco envíe la
 * cartola automáticamente vía la suscripción "Cartola por email" del
 * Office Banking.
 *
 * Formato del email:
 *   cartola.<KEY>@<DOMAIN>
 *
 * - KEY es un hash SHA256 truncado a 12 caracteres del tenantId. No es
 *   adivinable a partir del nombre del tenant; sirve para que el receptor
 *   identifique a qué tenant pertenece el mail entrante.
 * - DOMAIN se controla por la env var CARTOLA_INBOUND_DOMAIN. Por defecto
 *   "cartola.opai.cl". El operador del sistema configura los MX de ese
 *   subdominio apuntando al provider de inbound (Postmark, Mailgun,
 *   Cloudflare Email Routing, etc.) que finalmente postea al webhook
 *   /api/inbound/cartola.
 *
 * Por qué punto y no `+`: Santander Office Banking (y varios otros bancos)
 * rechazan el plus-addressing como "formato no válido" en su validador de
 * suscripción. El punto es 100% compatible con cualquier validador de
 * email estándar.
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
 * Ejemplo: cartola.7a3b2c4d8901@cartola.opai.cl
 */
export function tenantInboxEmail(tenantId: string): string {
  return `cartola.${tenantInboxKey(tenantId)}@${inboxDomain()}`;
}

/**
 * Extrae la key de un email entrante. Acepta el formato canónico con punto
 * (cartola.KEY@dominio), el legacy con plus (cartola+KEY@dominio) y el
 * formato corto (KEY@dominio) por si algún provider strippea el local-part.
 *
 * Si `requiredDomain` se pasa, exige que el dominio del email termine en él
 * (case-insensitive). Esto evita que un mail dirigido a otro inbox con
 * local-part hex-12 calce por accidente y se procese como cartola.
 *
 * Devuelve null si el formato no calza.
 */
export function extractInboxKey(
  toAddress: string,
  requiredDomain?: string,
): string | null {
  const lower = toAddress.toLowerCase().trim();
  let key: string | null = null;
  // cartola.KEY@anything (formato canónico actual)
  const dot = lower.match(/^cartola\.([a-f0-9]{12})@/);
  if (dot) key = dot[1];
  // cartola+KEY@anything (legacy, algunos bancos lo rechazan)
  if (!key) {
    const plus = lower.match(/^cartola\+([a-f0-9]{12})@/);
    if (plus) key = plus[1];
  }
  // KEY@anything (fallback corto, si alguien usa un alias)
  if (!key) {
    const bare = lower.match(/^([a-f0-9]{12})@/);
    if (bare) key = bare[1];
  }
  if (!key) return null;
  if (requiredDomain) {
    const at = lower.lastIndexOf("@");
    const dom = at >= 0 ? lower.slice(at + 1) : "";
    if (!dom.endsWith(requiredDomain.toLowerCase())) return null;
  }
  return key;
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
