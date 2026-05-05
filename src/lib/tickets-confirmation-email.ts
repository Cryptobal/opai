/**
 * Email de confirmación al cliente cuando se crea un ticket asociado
 * a su cuenta — ya sea desde el portal cliente o desde la UI interna
 * de Ops (vía `source = "portal_cliente"`).
 *
 * Centraliza el HTML y el envío para que ambos flujos manden el mismo
 * mensaje y los cambios de copy/branding queden en un solo lugar.
 */

import { resend, getTenantEmailConfig } from "@/lib/resend";
import { getTenantSiteUrl } from "@/lib/emails/site-url";

export interface ClientTicketConfirmationInput {
  tenantId: string;
  contactEmail: string;
  contactName: string | null;
  ticketCode: string;
  ticketId: string;
  ticketTitle: string;
  ticketDescription?: string | null;
  /** Si se incluye, el correo agrega un bloque "Acceso público" con el link y PIN. */
  publicAccess?: { url: string; pin: string } | null;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildHtml(opts: {
  code: string;
  title: string;
  description: string | null;
  logoUrl: string;
  companyName: string;
  contactName: string;
  portalLink: string;
  publicAccess: { url: string; pin: string } | null;
}): string {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0c1222;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:32px 16px;">
  ${opts.logoUrl ? `<img src="${escapeHtml(opts.logoUrl)}" alt="${escapeHtml(opts.companyName)}" style="height:32px;margin-bottom:24px;" />` : `<p style="color:#f1f5f9;font-size:18px;font-weight:700;margin:0 0 24px;">${escapeHtml(opts.companyName)}</p>`}
  <div style="background:#111827;border:1px solid #1e293b;border-radius:12px;padding:24px;">
    <p style="color:#f1f5f9;font-size:16px;margin:0 0 8px;">Hola ${escapeHtml(opts.contactName)},</p>
    <p style="color:#94a3b8;font-size:14px;line-height:1.6;margin:0 0 20px;">
      Hemos recibido tu solicitud y se ha creado el ticket <strong style="color:#f1f5f9;">${escapeHtml(opts.code)}</strong>.
    </p>
    <div style="background:#0c1222;border:1px solid #1e293b;border-radius:8px;padding:16px;margin:0 0 20px;">
      <p style="color:#94a3b8;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 4px;">Ticket</p>
      <p style="color:#f1f5f9;font-size:14px;font-weight:600;margin:0 0 8px;">${escapeHtml(opts.code)} — ${escapeHtml(opts.title)}</p>
      ${opts.description ? `<p style="color:#94a3b8;font-size:13px;margin:0;line-height:1.5;">${escapeHtml(opts.description).substring(0, 300)}</p>` : ""}
    </div>
    <p style="color:#94a3b8;font-size:14px;line-height:1.6;margin:0 0 20px;">
      Puedes hacer seguimiento del estado y agregar comentarios desde el portal.
    </p>
    <a href="${escapeHtml(opts.portalLink)}" style="display:inline-block;background:#3b82f6;color:#fff;text-decoration:none;padding:10px 24px;border-radius:8px;font-size:14px;font-weight:500;">
      Ver en el portal
    </a>
    ${
      opts.publicAccess
        ? `
    <div style="margin-top:24px;padding-top:20px;border-top:1px solid #1e293b;">
      <p style="color:#94a3b8;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 8px;">Acceso público (sin login)</p>
      <p style="color:#94a3b8;font-size:13px;line-height:1.6;margin:0 0 8px;">
        También puedes ver el ticket directamente en esta página usando el siguiente código:
      </p>
      <p style="color:#f1f5f9;font-size:13px;margin:0 0 12px;">
        <a href="${escapeHtml(opts.publicAccess.url)}" style="color:#60a5fa;text-decoration:underline;">${escapeHtml(opts.publicAccess.url)}</a>
      </p>
      <p style="color:#f1f5f9;font-size:14px;margin:0;">
        Código: <strong style="font-family:'SFMono-Regular',Consolas,monospace;letter-spacing:0.1em;">${escapeHtml(opts.publicAccess.pin)}</strong>
      </p>
    </div>`
        : ""
    }
  </div>
  <p style="color:#475569;font-size:11px;text-align:center;margin:24px 0 0;">
    ${escapeHtml(opts.companyName)} — Este es un email automático, puedes responder directamente a este correo.
  </p>
</div>
</body>
</html>`;
}

/**
 * Envía el correo de confirmación al cliente. No lanza: si Resend o la
 * config de tenant fallan, deja log y retorna `false` para que el caller
 * decida si avisa al operador.
 */
export async function sendClientTicketConfirmationEmail(
  input: ClientTicketConfirmationInput,
): Promise<boolean> {
  try {
    const emailCfg = await getTenantEmailConfig(input.tenantId);
    const baseUrl = getTenantSiteUrl(emailCfg.tenantSlug);
    const portalLink = `${baseUrl}/portal/cliente?section=tickets`;
    const inboundDomain = process.env.TICKETS_INBOUND_DOMAIN || "reply.opai.cl";
    const replyToAlias = `tickets+${input.ticketId}@${inboundDomain}`;

    await resend.emails.send({
      from: emailCfg.from,
      to: input.contactEmail,
      replyTo: replyToAlias,
      subject: `[${input.ticketCode}] Hemos recibido tu solicitud: ${input.ticketTitle}`,
      html: buildHtml({
        code: input.ticketCode,
        title: input.ticketTitle,
        description: input.ticketDescription ?? null,
        logoUrl: emailCfg.logoUrl,
        companyName: emailCfg.companyName,
        contactName: input.contactName?.trim() || "Estimado/a cliente",
        portalLink,
        publicAccess: input.publicAccess
          ? {
              url: input.publicAccess.url.startsWith("http")
                ? input.publicAccess.url
                : `${baseUrl}${input.publicAccess.url}`,
              pin: input.publicAccess.pin,
            }
          : null,
      }),
    });
    return true;
  } catch (err) {
    console.error("[tickets] confirmation email error:", err);
    return false;
  }
}
