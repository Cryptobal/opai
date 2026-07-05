import type { NotificationChannelDefaults } from "./catalog";

/** Tipos de vencimientos de documentos (operacionales + guardia + digest + escalada). */
export const DOC_EXPIRY_NOTIF_TYPES = new Set([
  "doc_operacional_expiring",
  "doc_operacional_expired",
  "docs_expiry_digest",
  "doc_escalated",
  "guardia_doc_expiring",
  "guardia_doc_expired",
]);

export function isDocExpiryNotifType(typeKey: string): boolean {
  return DOC_EXPIRY_NOTIF_TYPES.has(typeKey);
}

/**
 * Cuando el tenant tiene Slack conectado, los avisos de vencimiento no envían
 * email por default (el canal Slack del tenant + opt-in personal cubren el caso).
 * Las preferencias explícitas del usuario siguen mandando.
 */
export function applySlackTenantEmailDefault(
  typeKey: string,
  catalogDefaults: NotificationChannelDefaults,
  tenantSlackActive: boolean,
): NotificationChannelDefaults {
  if (!tenantSlackActive || !isDocExpiryNotifType(typeKey)) {
    return catalogDefaults;
  }
  return { ...catalogDefaults, email: false };
}
