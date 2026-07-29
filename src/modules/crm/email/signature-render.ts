/**
 * Render server-side de firma estructurada → HTML compatible con clientes
 * de correo (tablas + estilos en línea). Puro: sin Prisma ni React.
 *
 * Devuelve SOLO el interior. El envoltorio con data-opai-signature lo agrega
 * appendSignatureOnce. No cambiar ese contrato.
 *
 * EXCEPCIÓN DS v3: hex en línea son obligatorios — los clientes de correo
 * no soportan variables CSS ni clases.
 */

import {
  DEFAULT_ACCENT,
  DEFAULT_LOGO_WIDTH,
  MAX_LOGO_WIDTH,
  MIN_LOGO_WIDTH,
  normalizeChilePhone,
  normalizeWebsiteHref,
  normalizeWhatsAppDigits,
  type SignatureData,
  websiteLabel,
} from "./signature-data";

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const COLOR_NAME = "#151a23";
const COLOR_META = "#5c6b82";
const COLOR_MUTED = "#8794a8";
const COLOR_RULE = "#e5e7eb";

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function linkStyle(accent: string): string {
  return `color:${accent};text-decoration:none;`;
}

function clampWidth(n: number | undefined): number {
  const w = typeof n === "number" && Number.isFinite(n) ? Math.round(n) : DEFAULT_LOGO_WIDTH;
  return Math.min(MAX_LOGO_WIDTH, Math.max(MIN_LOGO_WIDTH, w));
}

function renderPhoneLink(phone: string, accent: string): string {
  const e164 = normalizeChilePhone(phone);
  const label = escapeHtml(phone);
  if (!e164) return label;
  return `<a href="tel:${escapeHtml(e164)}" style="${linkStyle(accent)}">${label}</a>`;
}

function renderWhatsAppLink(whatsapp: string, accent: string): string {
  const digits = normalizeWhatsAppDigits(whatsapp);
  const label = "WhatsApp";
  if (!digits) return escapeHtml(whatsapp);
  return `<a href="https://wa.me/${escapeHtml(digits)}" style="${linkStyle(accent)}" target="_blank">${label}</a>`;
}

function renderEmailLink(email: string, accent: string): string {
  const safe = escapeHtml(email);
  return `<a href="mailto:${safe}" style="${linkStyle(accent)}">${safe}</a>`;
}

function renderWebLink(website: string, accent: string): string {
  const href = normalizeWebsiteHref(website);
  const label = escapeHtml(websiteLabel(website));
  return `<a href="${escapeHtml(href)}" style="${linkStyle(accent)}" target="_blank">${label}</a>`;
}

function renderContactLine(data: SignatureData, accent: string): string {
  const parts: string[] = [];
  if (data.phone) parts.push(renderPhoneLink(data.phone, accent));
  if (data.whatsapp) parts.push(renderWhatsAppLink(data.whatsapp, accent));
  if (parts.length === 0) return "";
  return `<div style="font-size:13px;line-height:1.45;color:${COLOR_META};margin:0 0 2px;">${parts.join(" <span style=\"color:" + COLOR_MUTED + ";\">|</span> ")}</div>`;
}

function renderLogoCell(data: SignatureData): string {
  if (!data.logoUrl || data.layout === "text-only") return "";
  const w = clampWidth(data.logoWidthPx);
  const alt = escapeHtml(data.company || data.fullName || "Logo");
  return `<img src="${escapeHtml(data.logoUrl)}" alt="${alt}" width="${w}" style="display:block;border:0;width:${w}px;max-width:100%;height:auto;" />`;
}

function renderTextBlock(data: SignatureData): string {
  const accent = data.accentColor && /^#[0-9a-fA-F]{6}$/.test(data.accentColor)
    ? data.accentColor.toLowerCase()
    : DEFAULT_ACCENT;

  const name = escapeHtml(data.fullName || "");
  const roleParts = [data.role, data.company].filter(Boolean).map((s) => escapeHtml(s!));
  const roleLine = roleParts.length
    ? `<div style="font-size:13px;line-height:1.45;color:${COLOR_META};margin:0 0 4px;">${roleParts.join(" · ")}</div>`
    : "";

  const contactLine = renderContactLine(data, accent);

  const emailLine = data.email
    ? `<div style="font-size:13px;line-height:1.45;margin:0 0 2px;">${renderEmailLink(data.email, accent)}</div>`
    : "";

  const webLine = data.website
    ? `<div style="font-size:13px;line-height:1.45;margin:0 0 2px;">${renderWebLink(data.website, accent)}</div>`
    : "";

  const addressLine = data.address
    ? `<div style="font-size:12px;line-height:1.4;color:${COLOR_MUTED};margin:2px 0 0;">${escapeHtml(data.address)}</div>`
    : "";

  return [
    `<div style="font-size:15px;font-weight:700;line-height:1.35;color:${COLOR_NAME};margin:0 0 2px;">${name}</div>`,
    roleLine,
    contactLine,
    emailLine,
    webLine,
    addressLine,
  ].join("");
}

function renderDisclaimer(data: SignatureData): string {
  if (!data.disclaimer) return "";
  return `<div style="font-size:11px;line-height:1.4;color:${COLOR_MUTED};margin-top:10px;">${escapeHtml(data.disclaimer)}</div>`;
}

/**
 * HTML interior de la firma (sin marcador data-opai-signature).
 * Determinista: misma entrada → mismo string.
 */
export function renderSignatureHtml(data: SignatureData): string {
  const logo = renderLogoCell(data);
  const text = renderTextBlock(data);
  const disclaimer = renderDisclaimer(data);
  const showLogo = Boolean(logo);

  let body: string;

  if (!showLogo || data.layout === "text-only") {
    body = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr><td style="font-family:${FONT};vertical-align:top;">${text}</td></tr></table>`;
  } else if (data.layout === "logo-top") {
    body = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
<tr><td style="font-family:${FONT};padding:0 0 10px;">${logo}</td></tr>
<tr><td style="font-family:${FONT};vertical-align:top;">${text}</td></tr>
</table>`;
  } else {
    // logo-left (default)
    body = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
<tr>
<td style="font-family:${FONT};vertical-align:middle;padding:0 14px 0 0;">${logo}</td>
<td style="font-family:${FONT};vertical-align:top;border-left:1px solid ${COLOR_RULE};padding:0 0 0 14px;">${text}</td>
</tr>
</table>`;
  }

  return `<div style="margin-top:18px;padding-top:14px;border-top:1px solid ${COLOR_RULE};font-family:${FONT};">
${body}
${disclaimer}
</div>`;
}
