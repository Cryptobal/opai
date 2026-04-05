/** Asunto por defecto del correo de invitación al portal (misma lógica que send-quote-to-portal). */

const MAX_LABEL = 72;
const MAX_CUSTOM_SUBJECT = 200;

export function truncateForEmailSubject(s: string, max = MAX_LABEL): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(1, max - 1))}…`;
}

export function buildDefaultPortalInviteEmailSubject(opts: {
  quoteCode: string;
  quoteName?: string | null;
  installationName?: string | null;
  tenantBrand?: string | null;
}): string {
  const quoteNameForEmail = opts.quoteName?.trim() || opts.installationName?.trim() || undefined;
  const subjectDisplayLabel = quoteNameForEmail
    ? truncateForEmailSubject(quoteNameForEmail, MAX_LABEL)
    : null;
  const tenantBrand = opts.tenantBrand?.trim() || "";
  return subjectDisplayLabel
    ? `${subjectDisplayLabel} · ${opts.quoteCode} — ${tenantBrand}`
    : `Propuesta · ${opts.quoteCode} — ${tenantBrand}`;
}

/** Límite práctico para asuntos personalizados por el usuario. */
export function truncateCustomEmailSubject(s: string): string {
  const t = s.trim();
  if (t.length <= MAX_CUSTOM_SUBJECT) return t;
  return `${t.slice(0, MAX_CUSTOM_SUBJECT - 1)}…`;
}
