/**
 * Finance Notifications
 *
 * Email helpers for rendición lifecycle events using Resend.
 * Each function is fire-and-forget safe — errors are logged but never thrown
 * so callers don't break if email delivery fails.
 */

import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.SITE_URL ||
  "https://opai.gard.cl";

const FROM = process.env.EMAIL_FROM || "OPAI <opai@gard.cl>";

function formatCLP(amount: number): string {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    minimumFractionDigits: 0,
  }).format(amount);
}

// ── notifyRendicionSubmitted ────────────────────────────────────────────────

export async function notifyRendicionSubmitted(data: {
  rendicionCode: string;
  submitterName: string;
  amount: number;
  approverEmails: string[];
}) {
  if (!resend) return;

  const formattedAmount = formatCLP(data.amount);

  for (const email of data.approverEmails) {
    try {
      await resend.emails.send({
        from: FROM,
        to: email,
        subject: `Rendición ${data.rendicionCode} pendiente de aprobación`,
        text: [
          `${data.submitterName} ha enviado la rendición ${data.rendicionCode} por ${formattedAmount} para su aprobación.`,
          "",
          `Revísala en: ${SITE_URL}/finanzas/aprobaciones`,
        ].join("\n"),
      });
    } catch (err) {
      console.error(
        `[Finance Notifications] Error sending submitted email to ${email}:`,
        err,
      );
    }
  }
}

// ── notifyRendicionApproved ─────────────────────────────────────────────────

export async function notifyRendicionApproved(data: {
  rendicionCode: string;
  amount: number;
  submitterEmail: string;
  approverName: string;
}) {
  if (!resend) return;

  const formattedAmount = formatCLP(data.amount);

  try {
    await resend.emails.send({
      from: FROM,
      to: data.submitterEmail,
      subject: `Tu rendición ${data.rendicionCode} fue aprobada`,
      text: [
        `Tu rendición ${data.rendicionCode} por ${formattedAmount} ha sido aprobada por ${data.approverName}.`,
        "",
        `El pago será procesado próximamente.`,
        "",
        `Ver detalle: ${SITE_URL}/finanzas`,
      ].join("\n"),
    });
  } catch (err) {
    console.error(
      `[Finance Notifications] Error sending approved email to ${data.submitterEmail}:`,
      err,
    );
  }
}

// ── notifyRendicionRejected ─────────────────────────────────────────────────

export async function notifyRendicionRejected(data: {
  rendicionCode: string;
  amount: number;
  submitterEmail: string;
  rejectorName: string;
  reason: string;
}) {
  if (!resend) return;

  const formattedAmount = formatCLP(data.amount);

  try {
    await resend.emails.send({
      from: FROM,
      to: data.submitterEmail,
      subject: `Tu rendición ${data.rendicionCode} fue rechazada`,
      text: [
        `Tu rendición ${data.rendicionCode} por ${formattedAmount} ha sido rechazada por ${data.rejectorName}.`,
        "",
        `Motivo: ${data.reason}`,
        "",
        `Puedes corregirla y reenviarla desde: ${SITE_URL}/finanzas`,
      ].join("\n"),
    });
  } catch (err) {
    console.error(
      `[Finance Notifications] Error sending rejected email to ${data.submitterEmail}:`,
      err,
    );
  }
}

// ── notifyRendicionPaid ─────────────────────────────────────────────────────

export async function notifyRendicionPaid(data: {
  rendicionCode: string;
  amount: number;
  submitterEmail: string;
  paymentCode: string;
}) {
  if (!resend) return;

  const formattedAmount = formatCLP(data.amount);

  try {
    await resend.emails.send({
      from: FROM,
      to: data.submitterEmail,
      subject: `Tu rendición ${data.rendicionCode} fue pagada`,
      text: [
        `Tu rendición ${data.rendicionCode} por ${formattedAmount} ha sido pagada.`,
        "",
        `Código de pago: ${data.paymentCode}`,
        "",
        `Ver detalle: ${SITE_URL}/finanzas`,
      ].join("\n"),
    });
  } catch (err) {
    console.error(
      `[Finance Notifications] Error sending paid email to ${data.submitterEmail}:`,
      err,
    );
  }
}
