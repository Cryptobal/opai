/**
 * Historial citado del composer (reply / reply-all / forward).
 * Separado del doc Tiptap para un solo scroll de hoja estilo Gmail.
 */

const GMAIL_QUOTE_RE = /<div\b[^>]*\bclass=["'][^"']*\bgmail_quote\b[^"']*["'][^>]*>/i;

/** true si el HTML (cuerpo o doc serializado) ya incluye un bloque gmail_quote. */
export function htmlContainsGmailQuote(html: string | null | undefined): boolean {
  if (!html) return false;
  return GMAIL_QUOTE_RE.test(html);
}

/**
 * Parte un borrador Gmail: cuerpo editable vs historial citado embebido.
 * Si no hay marcador, todo el HTML es cuerpo y quotedHtml queda null.
 */
export function splitDraftBodyAndQuote(html: string | null | undefined): {
  bodyHtml: string | null;
  quotedHtml: string | null;
} {
  if (!html?.trim()) return { bodyHtml: html ?? null, quotedHtml: null };
  const match = GMAIL_QUOTE_RE.exec(html);
  if (!match || match.index == null) {
    return { bodyHtml: html, quotedHtml: null };
  }
  const bodyHtml = html.slice(0, match.index).trim() || null;
  const quotedHtml = html.slice(match.index).trim() || null;
  return { bodyHtml, quotedHtml };
}

/**
 * Marcadores de historial citado por proveedor. El corte se hace en el PRIMERO
 * que aparezca en el HTML del mensaje.
 */
const QUOTE_MARKERS: RegExp[] = [
  GMAIL_QUOTE_RE,
  // Apple Mail / clientes que citan con blockquote semántico.
  /<blockquote\b[^>]*\btype\s*=\s*["']cite["'][^>]*>/i,
  // Outlook (web y escritorio): separador de respuesta / reenvío.
  /<(?:div|hr)\b[^>]*\bid\s*=\s*["'](?:divRplyFwdMsg|appendonsend)["'][^>]*>/i,
  /<div\b[^>]*\bclass=["'][^"']*\byahoo_quoted\b[^"']*["'][^>]*>/i,
  /<div\b[^>]*\bclass=["'][^"']*\bmoz-cite-prefix\b[^"']*["'][^>]*>/i,
  // Separadores textuales de reenvío / mensaje original (incluye el tag contenedor).
  /(?:<(?:div|p|span)\b[^>]*>\s*)?[-_]{2,}\s*(?:Mensaje original|Original Message|Forwarded message|Mensaje reenviado)\s*[-_]{2,}/i,
];

/**
 * Cabecera textual de cita ("El 3 de enero…, Juan escribió:" / "On …, wrote:").
 * Solo cuenta al inicio de un bloque: una mención en medio de un párrafo no
 * debe recortar el correo.
 */
const TEXT_QUOTE_HEADER_RE =
  /(?:^|<(?:div|p|blockquote|td|span)\b[^>]*>|<br\s*\/?>)\s*(?:El|On)\s[^<>]{5,240}?\s(?:escribi[oó]|wrote)\s*:/i;

/** Cabeceras típicas del bloque citado Outlook (ES/EN). */
const OUTLOOK_HEADER_PLAIN_RE =
  /\b(?:De|From)\s*:/i;
const OUTLOOK_HEADER_META_RE =
  /\b(?:Enviado(?:\s+el)?|Sent|Para|To|CC|CCO|BCC|Asunto|Subject)\s*:/i;

/** true si el HTML conserva contenido útil (texto, imagen o tabla). */
function hasVisibleContent(html: string): boolean {
  if (/<(?:img|table)\b/i.test(html)) return true;
  return Boolean(
    html
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function plainWindow(html: string, start: number, len: number): string {
  return html
    .slice(start, start + len)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ");
}

/**
 * Outlook Word/desktop: el historial va tras un div con `border-top:solid`
 * (o un `<hr>`) seguido de cabeceras De/From + Enviado/Para/Asunto.
 * `De:` suele vivir dentro de `<b><span>De:</span></b>`, no en id divRplyFwdMsg.
 */
export function findOutlookQuoteIndex(html: string): number {
  const borderRe =
    /<div\b[^>]*\bstyle=["'][^"']*border-top\s*:\s*solid[^"']*["'][^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = borderRe.exec(html)) !== null) {
    const plain = plainWindow(html, match.index, 900);
    if (OUTLOOK_HEADER_PLAIN_RE.test(plain) && OUTLOOK_HEADER_META_RE.test(plain)) {
      return match.index;
    }
  }

  const hrRe = /<hr\b[^>]*>/gi;
  while ((match = hrRe.exec(html)) !== null) {
    const plain = plainWindow(html, match.index, 700);
    if (OUTLOOK_HEADER_PLAIN_RE.test(plain) && OUTLOOK_HEADER_META_RE.test(plain)) {
      return match.index;
    }
  }

  return -1;
}

/**
 * Separa el cuerpo del mensaje de su historial citado embebido (lector).
 * Corta en el primer marcador encontrado; si el corte dejaría el cuerpo vacío
 * (p. ej. un reenvío que es solo historial) devuelve el HTML intacto.
 */
export function splitMessageQuote(html: string | null | undefined): {
  bodyHtml: string | null;
  quotedHtml: string | null;
} {
  if (!html?.trim()) return { bodyHtml: html ?? null, quotedHtml: null };

  let cut = -1;
  for (const re of [...QUOTE_MARKERS, TEXT_QUOTE_HEADER_RE]) {
    const match = re.exec(html);
    if (!match || match.index == null) continue;
    if (cut === -1 || match.index < cut) cut = match.index;
  }
  const outlookCut = findOutlookQuoteIndex(html);
  if (outlookCut > 0 && (cut === -1 || outlookCut < cut)) cut = outlookCut;

  if (cut <= 0) return { bodyHtml: html, quotedHtml: null };

  const bodyHtml = html.slice(0, cut).trim();
  const quotedHtml = html.slice(cut).trim();
  if (!bodyHtml || !quotedHtml || !hasVisibleContent(bodyHtml)) {
    return { bodyHtml: html, quotedHtml: null };
  }
  return { bodyHtml, quotedHtml };
}

export type QuotedMessageSource = {
  fromEmail: string;
  sentAt: string | null;
  subject: string;
  toEmails: string[];
  htmlBody: string | null;
  textBody: string | null;
};

/** Meta + cuerpo del mensaje citado (sin wrapper gmail_quote). */
export function buildQuotedMessageInnerHtml(msg: QuotedMessageSource): string {
  const meta = [
    `De: ${escapeHtml(msg.fromEmail)}`,
    msg.sentAt ? `Fecha: ${escapeHtml(new Date(msg.sentAt).toLocaleString("es-CL"))}` : null,
    `Asunto: ${escapeHtml(msg.subject)}`,
    `Para: ${escapeHtml(msg.toEmails.join(", "))}`,
  ]
    .filter(Boolean)
    .join("<br>");
  const body =
    msg.htmlBody?.trim() ||
    (msg.textBody
      ? escapeHtml(msg.textBody).replace(/\n/g, "<br>")
      : "");
  return `${meta}<br><br>${body}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Encabezado de cita al anexar en el HTML saliente. */
export function quoteSendHeader(mode: "forward" | "reply"): string {
  return mode === "forward"
    ? "--------- Mensaje reenviado ---------"
    : "--------- Mensaje original ---------";
}

/**
 * Anexa el historial citado al HTML del envío sin duplicar si el cuerpo
 * (o el propio quotedHtml de un borrador viejo) ya trae gmail_quote.
 */
export function appendQuotedHtmlToSend(
  html: string,
  quotedHtml: string | null | undefined,
  mode: "forward" | "reply",
): string {
  if (!quotedHtml?.trim()) return html;
  if (htmlContainsGmailQuote(html)) return html;
  if (htmlContainsGmailQuote(quotedHtml)) {
    return `${html}<br>${quotedHtml}`;
  }
  return `${html}<br><div class="gmail_quote">${quoteSendHeader(mode)}<br>${quotedHtml}</div>`;
}
