/**
 * Inyección idempotente de firma (fix R2): el envío agregaba la firma sin
 * mirar el HTML, y cuando el composer ya la incluía (o el correo se
 * re-despachaba) salía duplicada. La firma inyectada por el server va envuelta
 * en un marcador para detectarla; también se detecta la firma "cruda" pegada
 * por composers legacy comparando el HTML normalizado.
 */

export const SIGNATURE_MARKER_ATTR = "data-opai-signature";

function normalizeHtml(html: string): string {
  return html.replace(/\s+/g, " ").trim();
}

/**
 * Agrega `signatureHtml` al final de `html` SOLO si no está ya presente
 * (por marcador o por contenido). Devuelve el HTML final.
 */
export function appendSignatureOnce(
  html: string,
  signatureHtml: string | null | undefined,
): { html: string; appended: boolean } {
  const sig = signatureHtml?.trim();
  if (!sig) return { html, appended: false };
  if (html.includes(SIGNATURE_MARKER_ATTR)) return { html, appended: false };
  const normalizedSig = normalizeHtml(sig);
  if (normalizedSig && normalizeHtml(html).includes(normalizedSig)) {
    return { html, appended: false };
  }
  return {
    html: `${html}<div ${SIGNATURE_MARKER_ATTR}="1">${sig}</div>`,
    appended: true,
  };
}
