/** Destino por defecto tras OAuth Gmail (bandeja CRM). */
export const GMAIL_DEFAULT_RETURN = "/crm/correos";

const ALLOWED_RETURN_PATHS = new Set([
  "/crm/correos",
  "/opai/configuracion/integraciones/gmail",
]);

/**
 * Valida `return` del OAuth Gmail (anti open-redirect). Solo paths absolutos
 * internos conocidos; cualquier otro valor cae al default de correos.
 */
export function safeGmailReturnPath(raw: string | null | undefined): string {
  if (!raw) return GMAIL_DEFAULT_RETURN;
  if (ALLOWED_RETURN_PATHS.has(raw)) return raw;
  return GMAIL_DEFAULT_RETURN;
}
