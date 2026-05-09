/**
 * Lista de dominios de email desechables conocidos. Si un signup viene de
 * estos dominios, se rechaza con 400.
 *
 * No es exhaustivo — los actores maliciosos rotan dominios. La idea es
 * cortar el 80% del abuso obvio sin generar falsos positivos en empresas reales.
 */
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "guerrillamail.com", "10minutemail.com", "yopmail.com",
  "tempmail.com", "trashmail.com", "throwaway.email", "fakeinbox.com",
  "getnada.com", "maildrop.cc", "sharklasers.com", "mailnesia.com",
  "tempinbox.com", "dispostable.com", "mintemail.com", "spambox.us",
]);

export function isDisposableEmail(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase().trim();
  if (!domain) return true;
  if (DISPOSABLE_DOMAINS.has(domain)) return true;
  // Heurística: emails con "+\d+" suelen ser aliasing para abuso
  if (/^.+\+\d{3,}@/.test(email.toLowerCase())) return true;
  return false;
}

const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.es", "outlook.com",
  "outlook.es", "hotmail.com", "hotmail.es", "live.com", "icloud.com",
  "me.com", "aol.com", "msn.com",
]);

export function isFreeEmailProvider(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase().trim();
  return domain ? FREE_EMAIL_DOMAINS.has(domain) : false;
}
