const SYSTEM_LOCAL =
  /^(no-?reply|noreply|notificaciones|notifications?|mailer-daemon|postmaster|bounce|donotreply)$/i;

const PUBLIC_MAIL =
  /^(gmail|googlemail|outlook|hotmail|live|yahoo|icloud|me|msn)\./i;

export function domainOf(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  return email.slice(at + 1).toLowerCase().trim() || null;
}

export function isPublicMailDomain(dom: string): boolean {
  return PUBLIC_MAIL.test(dom);
}

export function snippetFromBody(textBody: string | null | undefined): string | null {
  if (!textBody) return null;
  const cleaned = textBody
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;
  return cleaned.length > 140 ? `${cleaned.slice(0, 140)}…` : cleaned;
}

export function isSystemSender(fromEmail: string | null, tenantDomains: Set<string>): boolean {
  if (!fromEmail) return false;
  const lower = fromEmail.toLowerCase().trim();
  const local = lower.split("@")[0] ?? "";
  if (SYSTEM_LOCAL.test(local)) return true;
  const dom = domainOf(lower);
  return Boolean(dom && tenantDomains.has(dom));
}

/** Campos de company config usados para derivar dominios propios del tenant. */
export type TenantDomainCompanyEmails = {
  emailFromAddress?: string | null;
  email?: string | null;
  emailOps?: string | null;
  emailFinance?: string | null;
  emailContact?: string | null;
  emailReplyTo?: string | null;
};

/**
 * Dominios propios del tenant (company config + casilla), excluyendo
 * proveedores públicos (gmail.com, etc.) sobre el dominio de la casilla.
 */
export function buildTenantDomains(
  company: TenantDomainCompanyEmails,
  mailboxEmail?: string | null,
): Set<string> {
  const tenantDomains = new Set<string>();
  for (const e of [
    company.emailFromAddress,
    company.email,
    company.emailOps,
    company.emailFinance,
    company.emailContact,
    company.emailReplyTo,
  ]) {
    const d = domainOf(e);
    if (d) tenantDomains.add(d);
  }
  const mailboxDom = domainOf(mailboxEmail ?? null);
  if (mailboxDom && !isPublicMailDomain(mailboxDom)) tenantDomains.add(mailboxDom);
  return tenantDomains;
}
