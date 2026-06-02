/**
 * Resolución del logo de una cuenta CRM.
 *
 * El logo puede venir en la columna `logoUrl` o embebido en `notes` con el
 * marcador `[[ACCOUNT_LOGO_URL:...]]` (formato legacy del flujo de aprobación).
 * Las rutas locales `/uploads/company-logos/` están rotas y se descartan.
 */
const ACCOUNT_LOGO_PREFIX = "[[ACCOUNT_LOGO_URL:";
const ACCOUNT_LOGO_SUFFIX = "]]";
const BROKEN_LOGO_PREFIX = "/uploads/company-logos/";

export function extractAccountLogoFromNotes(notes: string | null | undefined): string | null {
  if (!notes) return null;
  const start = notes.indexOf(ACCOUNT_LOGO_PREFIX);
  if (start === -1) return null;
  const end = notes.indexOf(ACCOUNT_LOGO_SUFFIX, start);
  if (end === -1) return null;
  const raw = notes.slice(start + ACCOUNT_LOGO_PREFIX.length, end).trim();
  return raw || null;
}

/**
 * Devuelve la URL de logo usable de una cuenta (columna o marcador en notes),
 * o undefined si no hay una válida.
 */
export function resolveAccountLogo(account: {
  logoUrl?: string | null;
  notes?: string | null;
}): string | undefined {
  const raw = account.logoUrl || extractAccountLogoFromNotes(account.notes) || undefined;
  if (!raw) return undefined;
  if (raw.startsWith(BROKEN_LOGO_PREFIX)) return undefined;
  return raw;
}
