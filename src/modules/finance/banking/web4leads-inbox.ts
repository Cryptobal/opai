/**
 * Web4Leads Inbox — utilidades para el endpoint webhook por tenant que recibe
 * movimientos bancarios en tiempo real desde Web4Leads.
 *
 * URL: https://www.opai.cl/api/inbound/web4leads/<KEY>
 *
 * - KEY  = SHA256("opai:web4leads:<tenantId>") truncado a 12 hex chars.
 *          Identifica el tenant. Va en la URL. No es secreto, pero sin el
 *          secret no se puede firmar el payload.
 * - SECRET (per-tenant) = HMAC_SHA256(WEB4LEADS_MASTER_SECRET,
 *          "web4leads:<tenantId>") en hex (64 chars). Derivado, no almacenado.
 *          Es lo que se entrega a Web4Leads. Comprometer el secret de un tenant
 *          no compromete a otros; se rota todo rotando el master. Para rotación
 *          independiente por tenant, migrar a un modelo TenantWebhookSecret.
 *
 * Resolución tenant desde KEY: se itera sobre los tenants vivos. No es hot path
 * (pocos POSTs por minuto), no requiere índice.
 */

import crypto from "crypto";

/** KEY pública estable de un tenant (12 hex chars) para el URL del webhook. */
export function tenantWeb4leadsKey(tenantId: string): string {
  return crypto
    .createHash("sha256")
    .update(`opai:web4leads:${tenantId}`)
    .digest("hex")
    .slice(0, 12);
}

/** Secret HMAC derivado per-tenant. Requiere WEB4LEADS_MASTER_SECRET en env. */
export function tenantWeb4leadsSecret(tenantId: string): string | null {
  const master = process.env.WEB4LEADS_MASTER_SECRET;
  if (!master) return null;
  return crypto
    .createHmac("sha256", master)
    .update(`web4leads:${tenantId}`)
    .digest("hex");
}

/** True si la KEY del URL corresponde al tenantId dado. */
export function web4leadsKeyMatchesTenant(
  key: string,
  tenantId: string,
): boolean {
  return key === tenantWeb4leadsKey(tenantId);
}

/**
 * Verifica la firma HMAC-SHA256 que envía Web4Leads.
 * Web4Leads firma: HMAC_SHA256(tenantSecret, rawBody + timestamp) en hex.
 * Usa timingSafeEqual para evitar timing attacks.
 */
export function verifyWeb4leadsSignature(
  rawBody: string,
  timestamp: string,
  signature: string,
  tenantSecret: string,
): boolean {
  try {
    const expected = crypto
      .createHmac("sha256", tenantSecret)
      .update(rawBody + timestamp)
      .digest("hex");
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(signature, "hex");
    if (a.length === 0 || a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Valida que el timestamp (epoch segundos) esté dentro de la ventana. */
export function isWeb4leadsTimestampValid(
  timestamp: string,
  windowSeconds = 300,
): boolean {
  const ts = parseInt(timestamp, 10);
  if (!Number.isFinite(ts)) return false;
  const now = Math.floor(Date.now() / 1000);
  return Math.abs(now - ts) <= windowSeconds;
}

/** Normaliza un número de cuenta a solo dígitos para hacer match robusto. */
export function normalizeAccountNumber(input: string): string {
  return (input ?? "").replace(/\D/g, "");
}

/** Normaliza un código de banco (uppercase, sin prefijo BANCO). */
export function normalizeBankCode(input: string): string {
  return (input ?? "").trim().toUpperCase().replace(/^BANCO\s+/, "");
}
