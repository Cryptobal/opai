/**
 * Layout branded para correos de seguimiento.
 *
 * Envuelve el HTML generado por el editor Tiptap en un template con:
 *   - Header (logo del tenant + eyebrow)
 *   - Hero (saludo + título de la oportunidad)
 *   - Body (contenido editable)
 *   - CTA botón principal al Portal del Cliente
 *   - Footer (ejecutivo asignado + datos del tenant)
 *
 * Se renderiza en HTML plano con estilos inline para máxima compatibilidad con
 * clientes de correo (Gmail, Outlook, iOS Mail). Mantiene la misma paleta que
 * `PortalClienteInviteEmail.tsx`.
 */

export interface FollowUpLayoutOptions {
  bodyHtml: string;
  sequence: 1 | 2 | 3;
  contactFirstName: string;
  dealTitle: string;
  accountName: string;
  ctaUrl: string;
  tenantLogoUrl?: string | null;
  tenantName: string;
  tenantPrimaryColor?: string | null;
  tenantPhone?: string | null;
  tenantEmail?: string | null;
  tenantWebsite?: string | null;
  ejecutivoName?: string | null;
}

const EYEBROWS: Record<1 | 2 | 3, string> = {
  1: "SEGUIMIENTO A TU PROPUESTA",
  2: "¿SEGUIMOS AVANZANDO?",
  3: "ÚLTIMO CONTACTO",
};

const CTA_LABELS: Record<1 | 2 | 3, string> = {
  1: "Ver propuesta en el portal",
  2: "Revisar propuesta en el portal",
  3: "Abrir mi propuesta",
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderFollowUpEmailHtml(opts: FollowUpLayoutOptions): string {
  const primary = opts.tenantPrimaryColor?.trim() || "#0056E0";
  const eyebrow = EYEBROWS[opts.sequence];
  const ctaLabel = CTA_LABELS[opts.sequence];
  const logoUrl = opts.tenantLogoUrl?.trim() || "";
  const phone = opts.tenantPhone?.trim() || "";
  const email = opts.tenantEmail?.trim() || "";
  const website = opts.tenantWebsite?.trim() || "";
  const tenantName = escapeHtml(opts.tenantName);
  const ctaUrl = escapeHtml(opts.ctaUrl);
  const preview = `${opts.accountName} · ${opts.dealTitle}`;

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="x-apple-disable-message-reformatting" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <title>${escapeHtml(eyebrow)}</title>
  </head>
  <body style="margin:0;padding:0;background:#F4F6FA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preview)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#F4F6FA;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;width:100%;background:#FFFFFF;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.08);">

            <!-- Header -->
            <tr>
              <td style="padding:24px 32px;background:${primary};color:#FFFFFF;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td align="left" style="vertical-align:middle;">
                      ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="${tenantName}" height="36" style="display:block;max-height:36px;border:0;outline:none;text-decoration:none;" />` : `<span style="color:#FFFFFF;font-size:18px;font-weight:600;letter-spacing:.3px;">${tenantName}</span>`}
                    </td>
                    <td align="right" style="vertical-align:middle;">
                      <span style="color:rgba(255,255,255,0.85);font-size:11px;letter-spacing:1.2px;text-transform:uppercase;">Portal del cliente</span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Hero -->
            <tr>
              <td style="padding:32px 32px 16px;">
                <p style="margin:0 0 10px;color:${primary};font-size:11px;letter-spacing:1.4px;text-transform:uppercase;font-weight:700;">${escapeHtml(eyebrow)}</p>
                <h1 style="margin:0 0 6px;color:#0F172A;font-size:22px;line-height:1.3;font-weight:700;">Hola ${escapeHtml(opts.contactFirstName)},</h1>
                <p style="margin:0;color:#475569;font-size:15px;line-height:1.55;">Sobre <strong style="color:#0F172A;">${escapeHtml(opts.dealTitle)}</strong> para <strong style="color:#0F172A;">${escapeHtml(opts.accountName)}</strong>.</p>
              </td>
            </tr>

            <!-- Body (contenido editable desde la plantilla) -->
            <tr>
              <td style="padding:8px 32px 4px;color:#334155;font-size:14.5px;line-height:1.6;">
                ${opts.bodyHtml}
              </td>
            </tr>

            <!-- CTA -->
            <tr>
              <td align="center" style="padding:20px 32px 8px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td align="center" bgcolor="${primary}" style="border-radius:8px;">
                      <a href="${ctaUrl}"
                         style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:8px;background:${primary};">
                        ${escapeHtml(ctaLabel)} →
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:10px 0 0;color:#64748B;font-size:12px;">Acceso directo — no necesitás ingresar el PIN.</p>
              </td>
            </tr>

            ${opts.ejecutivoName ? `
            <!-- Ejecutivo -->
            <tr>
              <td style="padding:18px 32px 0;">
                <div style="padding:14px 16px;background:#F8FAFC;border-left:3px solid ${primary};border-radius:4px;">
                  <p style="margin:0;color:#64748B;font-size:11px;letter-spacing:1px;text-transform:uppercase;font-weight:600;">Tu ejecutivo</p>
                  <p style="margin:4px 0 0;color:#0F172A;font-size:14px;font-weight:600;">${escapeHtml(opts.ejecutivoName)}</p>
                </div>
              </td>
            </tr>` : ""}

            <!-- Divider -->
            <tr>
              <td style="padding:24px 32px 0;">
                <div style="height:1px;background:#E2E8F0;"></div>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="padding:16px 32px 28px;color:#64748B;font-size:12px;line-height:1.6;">
                <strong style="color:#0F172A;">${tenantName}</strong><br />
                ${[
                  phone ? escapeHtml(phone) : "",
                  email ? `<a href="mailto:${escapeHtml(email)}" style="color:${primary};text-decoration:none;">${escapeHtml(email)}</a>` : "",
                  website ? `<a href="${escapeHtml(website.startsWith("http") ? website : `https://${website}`)}" style="color:${primary};text-decoration:none;">${escapeHtml(website.replace(/^https?:\/\//, ""))}</a>` : "",
                ].filter(Boolean).join(" · ")}
              </td>
            </tr>

          </table>
          <p style="margin:14px 0 0;color:#94A3B8;font-size:11px;">Recibes este correo porque ${escapeHtml(tenantName)} te envió una propuesta comercial.</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
