import { render } from "@react-email/render";
import { EMAIL_CONFIG, resend } from "@/lib/resend";
import SignatureRequestEmail from "@/emails/SignatureRequestEmail";
import SignatureCompletedNotifyEmail from "@/emails/SignatureCompletedNotifyEmail";
import SignatureAllCompletedEmail from "@/emails/SignatureAllCompletedEmail";
import SignatureReminderEmail from "@/emails/SignatureReminderEmail";
import ContractReviewRequestEmail from "@/emails/ContractReviewRequestEmail";

type SignatureMailResult = { ok: true; id?: string } | { ok: false; error: string };

function toErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Error desconocido";
}

export async function sendSignatureRequestEmail(input: {
  to: string;
  recipientName: string;
  documentTitle: string;
  signingUrl: string;
  senderName?: string;
  expiresAt?: string | null;
  message?: string | null;
}): Promise<SignatureMailResult> {
  try {
    const html = await render(SignatureRequestEmail(input));
    const response = await resend.emails.send({
      from: EMAIL_CONFIG.from,
      to: input.to,
      replyTo: EMAIL_CONFIG.replyTo,
      subject: `Firma requerida: ${input.documentTitle}`,
      html,
      tags: [{ name: "type", value: "doc_signature_request" }],
    });
    if (response.error) return { ok: false, error: JSON.stringify(response.error) };
    return { ok: true, id: response.data?.id };
  } catch (error) {
    return { ok: false, error: toErrorMessage(error) };
  }
}

export async function sendSignatureReminderEmail(input: {
  to: string;
  recipientName: string;
  documentTitle: string;
  signingUrl: string;
  expiresAt?: string | null;
}): Promise<SignatureMailResult> {
  try {
    const html = await render(SignatureReminderEmail(input));
    const response = await resend.emails.send({
      from: EMAIL_CONFIG.from,
      to: input.to,
      replyTo: EMAIL_CONFIG.replyTo,
      subject: `Recordatorio de firma: ${input.documentTitle}`,
      html,
      tags: [{ name: "type", value: "doc_signature_reminder" }],
    });
    if (response.error) return { ok: false, error: JSON.stringify(response.error) };
    return { ok: true, id: response.data?.id };
  } catch (error) {
    return { ok: false, error: toErrorMessage(error) };
  }
}

export async function sendSignatureCompletedNotifyEmail(input: {
  to: string;
  documentTitle: string;
  signerName: string;
  signerEmail: string;
  signedAt: string;
  statusUrl?: string;
  tenantSlug?: string | null;
}): Promise<SignatureMailResult> {
  try {
    const html = await render(SignatureCompletedNotifyEmail(input));
    const response = await resend.emails.send({
      from: EMAIL_CONFIG.from,
      to: input.to,
      replyTo: EMAIL_CONFIG.replyTo,
      subject: `Firma registrada: ${input.documentTitle}`,
      html,
      tags: [{ name: "type", value: "doc_signature_signed" }],
    });
    if (response.error) return { ok: false, error: JSON.stringify(response.error) };
    return { ok: true, id: response.data?.id };
  } catch (error) {
    return { ok: false, error: toErrorMessage(error) };
  }
}

export async function sendContractReviewRequestEmail(input: {
  to: string;
  recipientName: string;
  documentTitle: string;
  reviewUrl: string;
  senderName?: string;
  senderCompany?: string;
  message?: string | null;
  portalSetupUrl?: string | null;
}): Promise<SignatureMailResult> {
  try {
    const html = await render(ContractReviewRequestEmail(input));
    const response = await resend.emails.send({
      from: EMAIL_CONFIG.from,
      to: input.to,
      replyTo: EMAIL_CONFIG.replyTo,
      subject: `Revisión de contrato: ${input.documentTitle}`,
      html,
      tags: [{ name: "type", value: "doc_contract_review_request" }],
    });
    if (response.error) return { ok: false, error: JSON.stringify(response.error) };
    return { ok: true, id: response.data?.id };
  } catch (error) {
    return { ok: false, error: toErrorMessage(error) };
  }
}

export async function sendSignatureAllCompletedEmail(input: {
  to: string;
  documentTitle: string;
  completedAt: string;
  documentUrl?: string | null;
  pdfUrl?: string | null;
  tenantSlug?: string | null;
}): Promise<SignatureMailResult> {
  try {
    const html = await render(SignatureAllCompletedEmail(input));
    const response = await resend.emails.send({
      from: EMAIL_CONFIG.from,
      to: input.to,
      replyTo: EMAIL_CONFIG.replyTo,
      subject: `Documento firmado por todos: ${input.documentTitle}`,
      html,
      tags: [{ name: "type", value: "doc_signature_completed" }],
    });
    if (response.error) return { ok: false, error: JSON.stringify(response.error) };
    return { ok: true, id: response.data?.id };
  } catch (error) {
    return { ok: false, error: toErrorMessage(error) };
  }
}
