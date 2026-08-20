/**
 * Destinatarios CC de proforma / estado de pago.
 * Extraído del send para poder testear el merge del cron sin prisma/Resend.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseCsvEmails(csv: string | null | undefined): string[] {
  if (!csv) return [];
  return csv
    .split(/[,;\n]/)
    .map((e) => e.trim())
    .filter((e) => e.length > 0 && EMAIL_RE.test(e));
}

function dedupeCaseInsensitive(emails: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of emails) {
    const trimmed = e.trim();
    const key = trimmed.toLowerCase();
    if (!key || !EMAIL_RE.test(key)) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

/**
 * En envíos automáticos del cron, los internos (cronCc + CCO finanzas) van
 * en CC visible: Google Groups no expande un mensaje si el grupo va solo
 * en BCC. En envío manual el CCO sigue oculto (lo mergea sendTenantEmail).
 */
export function mergeBillingDocumentCc(opts: {
  isAutoFromCron: boolean;
  existingCc: string[];
  primary: string | null;
  cronCcCsv: string;
  ccoFinanceCsv: string;
}): string[] {
  const extras = opts.isAutoFromCron
    ? [...parseCsvEmails(opts.cronCcCsv), ...parseCsvEmails(opts.ccoFinanceCsv)]
    : [];
  const primaryLower = (opts.primary ?? "").trim().toLowerCase();
  return dedupeCaseInsensitive([...opts.existingCc, ...extras]).filter(
    (e) => e.toLowerCase() !== primaryLower,
  );
}
