/**
 * Finance Notifications
 *
 * Email helpers for rendición lifecycle events. Uses sendTenantEmail so
 * the FROM/Reply-To/BCC are resolved per tenant — no env-global FROM.
 * Each function is fire-and-forget safe — errors are logged but never thrown
 * so callers don't break if email delivery fails.
 */

import { sendTenantEmail } from "@/lib/email/send-tenant-email";
import {
  getCanonicalSiteUrl,
  getNotificationPrefsUrl,
} from "@/lib/emails/site-url";

const SITE_URL = getCanonicalSiteUrl();
const PREFS_URL = getNotificationPrefsUrl();

const RESEND_AVAILABLE = Boolean(process.env.RESEND_API_KEY);

function formatCLP(amount: number): string {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    minimumFractionDigits: 0,
  }).format(amount);
}

// ── notifyRendicionSubmitted ────────────────────────────────────────────────

export async function notifyRendicionSubmitted(data: {
  tenantId: string;
  rendicionCode: string;
  submitterName: string;
  amount: number;
  approverEmails: string[];
}) {
  if (!RESEND_AVAILABLE) return;

  const formattedAmount = formatCLP(data.amount);

  for (const email of data.approverEmails) {
    try {
      await sendTenantEmail({
        tenantId: data.tenantId,
        module: "finance",
        kind: "rendicion_submitted",
        to: email,
        subject: `Rendición ${data.rendicionCode} pendiente de aprobación`,
        text: [
          `${data.submitterName} ha enviado la rendición ${data.rendicionCode} por ${formattedAmount} para su aprobación.`,
          "",
          `Revísala en: ${SITE_URL}/finanzas/rendiciones/aprobaciones`,
          "",
          "---",
          `¿No quieres recibir este tipo de alertas? Administrar notificaciones: ${PREFS_URL}`,
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
  tenantId: string;
  rendicionCode: string;
  amount: number;
  submitterEmail: string;
  approverName: string;
}) {
  if (!RESEND_AVAILABLE) return;

  const formattedAmount = formatCLP(data.amount);

  try {
    await sendTenantEmail({
      tenantId: data.tenantId,
      module: "finance",
      kind: "rendicion_approved",
      to: data.submitterEmail,
      subject: `Tu rendición ${data.rendicionCode} fue aprobada`,
      text: [
        `Tu rendición ${data.rendicionCode} por ${formattedAmount} ha sido aprobada por ${data.approverName}.`,
        "",
        `El pago será procesado próximamente.`,
        "",
        `Ver detalle: ${SITE_URL}/finanzas`,
        "",
        "---",
        `¿No quieres recibir este tipo de alertas? Administrar notificaciones: ${PREFS_URL}`,
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
  tenantId: string;
  rendicionCode: string;
  amount: number;
  submitterEmail: string;
  rejectorName: string;
  reason: string;
}) {
  if (!RESEND_AVAILABLE) return;

  const formattedAmount = formatCLP(data.amount);

  try {
    await sendTenantEmail({
      tenantId: data.tenantId,
      module: "finance",
      kind: "rendicion_rejected",
      to: data.submitterEmail,
      subject: `Tu rendición ${data.rendicionCode} fue rechazada`,
      text: [
        `Tu rendición ${data.rendicionCode} por ${formattedAmount} ha sido rechazada por ${data.rejectorName}.`,
        "",
        `Motivo: ${data.reason}`,
        "",
        `Puedes corregirla y reenviarla desde: ${SITE_URL}/finanzas`,
        "",
        "---",
        `¿No quieres recibir este tipo de alertas? Administrar notificaciones: ${PREFS_URL}`,
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
  tenantId: string;
  rendicionCode: string;
  amount: number;
  submitterEmail: string;
  paymentCode: string;
}) {
  if (!RESEND_AVAILABLE) return;

  const formattedAmount = formatCLP(data.amount);

  try {
    await sendTenantEmail({
      tenantId: data.tenantId,
      module: "finance",
      kind: "rendicion_paid",
      to: data.submitterEmail,
      subject: `Tu rendición ${data.rendicionCode} fue pagada`,
      text: [
        `Tu rendición ${data.rendicionCode} por ${formattedAmount} ha sido pagada.`,
        "",
        `Código de pago: ${data.paymentCode}`,
        "",
        `Ver detalle: ${SITE_URL}/finanzas`,
        "",
        "---",
        `¿No quieres recibir este tipo de alertas? Administrar notificaciones: ${PREFS_URL}`,
      ].join("\n"),
    });
  } catch (err) {
    console.error(
      `[Finance Notifications] Error sending paid email to ${data.submitterEmail}:`,
      err,
    );
  }
}
