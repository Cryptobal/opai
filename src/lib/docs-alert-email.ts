import { render } from "@react-email/render";
import { EMAIL_CONFIG, resend } from "@/lib/resend";
import DocumentExpiringEmail from "@/emails/DocumentExpiringEmail";
import DocumentExpiredEmail from "@/emails/DocumentExpiredEmail";

type MailResult = { ok: true; id?: string } | { ok: false; error: string };

function toError(e: unknown) {
  return e instanceof Error ? e.message : "Error desconocido";
}

export async function sendDocumentExpiringEmail(input: {
  to: string;
  documentTitle: string;
  expirationDate: string;
  daysRemaining: number;
  documentUrl: string;
  tenantSlug?: string | null;
}): Promise<MailResult> {
  try {
    const html = await render(DocumentExpiringEmail(input));
    const res = await resend.emails.send({
      from: EMAIL_CONFIG.from,
      to: input.to,
      replyTo: EMAIL_CONFIG.replyTo,
      subject: `⚠️ Documento por vencer (${input.daysRemaining} días): ${input.documentTitle}`,
      html,
      tags: [{ name: "type", value: "doc_expiring" }],
    });
    if (res.error) return { ok: false, error: JSON.stringify(res.error) };
    return { ok: true, id: res.data?.id };
  } catch (e) {
    return { ok: false, error: toError(e) };
  }
}

export async function sendDocumentExpiredEmail(input: {
  to: string;
  documentTitle: string;
  expirationDate: string;
  documentUrl: string;
  tenantSlug?: string | null;
}): Promise<MailResult> {
  try {
    const html = await render(DocumentExpiredEmail(input));
    const res = await resend.emails.send({
      from: EMAIL_CONFIG.from,
      to: input.to,
      replyTo: EMAIL_CONFIG.replyTo,
      subject: `🔴 Documento vencido: ${input.documentTitle}`,
      html,
      tags: [{ name: "type", value: "doc_expired" }],
    });
    if (res.error) return { ok: false, error: JSON.stringify(res.error) };
    return { ok: true, id: res.data?.id };
  } catch (e) {
    return { ok: false, error: toError(e) };
  }
}
