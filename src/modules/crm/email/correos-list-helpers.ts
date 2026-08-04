import { extractEmailAddresses } from "@/lib/email-address";

const SYSTEM_LOCAL =
  /^(no-?reply|noreply|notificaciones|notifications?|mailer-daemon|postmaster|bounce|donotreply)$/i;

const PUBLIC_MAIL =
  /^(gmail|googlemail|outlook|hotmail|live|yahoo|icloud|me|msn)\./i;

/**
 * Dominio de una dirección. Parsea headers con display name
 * (`"Nombre" <a@b.cl>`) antes de tomar el dominio — el string almacenado
 * suele venir de `formatFromHeaderForStorage`.
 */
export function domainOf(email: string | null | undefined): string | null {
  if (!email) return null;
  const parsed = extractEmailAddresses(email)[0] ?? email.trim();
  const at = parsed.lastIndexOf("@");
  if (at < 0) return null;
  return parsed.slice(at + 1).toLowerCase().trim() || null;
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

type ListPreviewMessage = {
  fromEmail: string;
  textBody: string | null;
  htmlBody: string | null;
  isDraft: boolean;
};

/**
 * Preview de fila (estilo Gmail): remitente del último no-borrador,
 * snippet del borrador si hay uno en la ventana, si no del último mensaje.
 */
export function pickThreadListPreview(messages: ListPreviewMessage[]) {
  const latest = messages[0] ?? null;
  const draft = messages.find((m) => m.isDraft) ?? null;
  const nonDraft = messages.find((m) => !m.isDraft) ?? null;
  const fromMsg = nonDraft ?? latest;
  const snippetMsg = draft ?? latest;
  const snippet =
    snippetFromBody(snippetMsg?.textBody) ??
    snippetFromBody(snippetMsg?.htmlBody?.replace(/<[^>]+>/g, " ") ?? null);
  return {
    fromEmail: fromMsg?.fromEmail ?? null,
    snippet,
    hasDraftInWindow: Boolean(draft),
  };
}

export function isSystemSender(fromEmail: string | null, tenantDomains: Set<string>): boolean {
  if (!fromEmail) return false;
  const address = extractEmailAddresses(fromEmail)[0] ?? fromEmail.toLowerCase().trim();
  const lower = address.toLowerCase().trim();
  const local = lower.split("@")[0] ?? "";
  if (SYSTEM_LOCAL.test(local)) return true;
  const dom = domainOf(lower);
  return Boolean(dom && tenantDomains.has(dom));
}

type CompanyEmailFields = {
  emailFromAddress?: string | null;
  email?: string | null;
  emailOps?: string | null;
  emailFinance?: string | null;
  emailContact?: string | null;
  emailReplyTo?: string | null;
};

/** Dominios propios del tenant (company config + casilla, excluyendo públicos). */
export function buildTenantDomains(
  company: CompanyEmailFields,
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
