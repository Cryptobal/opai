/**
 * Resolve el envío por cada canal soportado del módulo psych.
 * Extraído del endpoint POST /api/psych/assessments/[id]/send para
 * mantener el route handler <145 líneas.
 *
 * WhatsApp/SMS: marcados como `skipped: true` con `reason` hasta tener
 * integración. La preview resuelta sigue volviendo al caller para que
 * pueda copiar/pegar manualmente.
 */

import { resend, getTenantEmailConfig } from "@/lib/resend";
import {
  resolveForChannel,
  DEFAULT_WHATSAPP_TEMPLATE,
  DEFAULT_EMAIL_SUBJECT,
  DEFAULT_EMAIL_BODY,
  DEFAULT_SMS_TEMPLATE,
  type MessageChannel,
  type MessageTokenContext,
} from "./resolveMessageTokens";
import { normalizePhone, buildWaUrl } from "./normalizePhone";

export interface ChannelResult {
  channel: MessageChannel;
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  preview?: string;
  waUrl?: string;
}

export interface SendConfig {
  whatsappTemplate: string | null;
  emailSubject: string | null;
  emailBody: string | null;
  smsTemplate: string | null;
}

export interface Target {
  email: string | null;
  phone: string | null;
}

export async function dispatchChannel(
  channel: MessageChannel,
  tenantId: string,
  cfg: SendConfig,
  target: Target,
  tokenCtx: MessageTokenContext,
): Promise<ChannelResult> {
  if (channel === "copy-link") {
    return { channel, ok: true, preview: tokenCtx.link };
  }
  if (channel === "email") {
    if (!target.email) {
      return { channel, ok: false, reason: "Sin email del destinatario" };
    }
    return sendEmail(tenantId, target.email, cfg, tokenCtx);
  }
  if (channel === "whatsapp") {
    const preview = resolveForChannel(
      cfg.whatsappTemplate ?? DEFAULT_WHATSAPP_TEMPLATE,
      "whatsapp",
      tokenCtx,
    );
    const phoneRes = normalizePhone(target.phone);
    if (!phoneRes.ok) {
      return {
        channel,
        ok: false,
        reason: `Teléfono inválido: ${phoneRes.error}`,
        preview,
      };
    }
    return {
      channel,
      ok: true,
      preview,
      waUrl: buildWaUrl(phoneRes.digits, preview),
    };
  }
  // sms
  const preview = resolveForChannel(
    cfg.smsTemplate ?? DEFAULT_SMS_TEMPLATE,
    "sms",
    tokenCtx,
  );
  return {
    channel,
    ok: true,
    skipped: true,
    reason: "SMS no configurado",
    preview,
  };
}

async function sendEmail(
  tenantId: string,
  to: string,
  cfg: SendConfig,
  tokenCtx: MessageTokenContext,
): Promise<ChannelResult> {
  try {
    const emailCfg = await getTenantEmailConfig(tenantId);
    const subject = resolveForChannel(
      cfg.emailSubject ?? DEFAULT_EMAIL_SUBJECT,
      "email",
      tokenCtx,
    );
    const bodyTpl = cfg.emailBody ?? DEFAULT_EMAIL_BODY;
    const text = resolveForChannel(bodyTpl, "whatsapp", tokenCtx);
    const html = resolveForChannel(bodyTpl, "email", tokenCtx).replace(
      /\n/g,
      "<br/>",
    );
    await resend.emails.send({
      from: emailCfg.from,
      to,
      subject,
      text,
      html,
      replyTo: emailCfg.replyTo || undefined,
    });
    return { channel: "email", ok: true };
  } catch (err) {
    return {
      channel: "email",
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}
