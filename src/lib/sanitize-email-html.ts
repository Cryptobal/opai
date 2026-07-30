// dompurify (browser), NO isomorphic-dompurify: este último arrastra `jsdom`
// para el caso servidor, y jsdom@29 depende de `@exodus/bytes` (ESM-only) que
// revienta el require del bundle en el servidor con ERR_REQUIRE_ESM → el SSR de
// los componentes de Correos tiraba React #419. La sanitización solo se ejecuta
// en el cliente (EmailHtmlBody/CorreoMessages son client components); en SSR se
// devuelve vacío y el cliente rellena al hidratar.
import DOMPurify from "dompurify";

/** GIF 1x1 transparente: placeholder de imágenes remotas bloqueadas. */
export const BLOCKED_IMG_PLACEHOLDER =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

/**
 * Flag de rollback (V4): con NEXT_PUBLIC_EMAIL_BLOCK_REMOTE_IMAGES=false se
 * vuelve al comportamiento anterior (imágenes remotas cargan al abrir).
 * Por defecto las imágenes remotas quedan bloqueadas (privacidad: pixels de
 * tracking no disparan al abrir el correo).
 */
export function remoteImageBlockingEnabled(): boolean {
  return process.env.NEXT_PUBLIC_EMAIL_BLOCK_REMOTE_IMAGES !== "false";
}

export type SanitizeEmailOptions = {
  /** Reescribe imágenes remotas a un placeholder (default: según flag env). */
  blockRemoteImages?: boolean;
};

const ALLOWED_TAGS = [
  "a", "b", "blockquote", "br", "caption", "code", "col", "colgroup",
  "div", "em", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "i", "img",
  "li", "ol", "p", "pre", "span", "strong", "sub", "sup", "table",
  "tbody", "td", "tfoot", "th", "thead", "tr", "u", "ul",
];

const ALLOWED_ATTR = [
  "href", "target", "rel", "src", "alt", "title", "width", "height",
  "colspan", "rowspan", "align", "valign", "border", "cellpadding",
  "cellspacing", "style", "class", "loading",
];

/** Sanitiza HTML de correo: sin scripts; links externos seguros; imgs lazy.
 * Con `blockRemoteImages` (default según flag env) las imágenes externas se
 * reescriben a un placeholder guardando el original en `data-blocked-src`;
 * las inline `cid:` y `data:` no se tocan. */
export function sanitizeEmailHtml(html: string, options?: SanitizeEmailOptions): string {
  if (!html.trim()) return "";
  // SSR (sin DOM): no sanitizamos ni emitimos HTML sin sanitizar — el cliente
  // (client component, useMemo) recalcula y rellena al hidratar. dompurify sin
  // window no filtra, así que devolver "" es la opción segura.
  if (typeof window === "undefined") return "";
  const blockImages = options?.blockRemoteImages ?? remoteImageBlockingEnabled();
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "input", "style"],
    FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover"],
  });
  // Post-pass: forzar target/rel en <a>, loading en <img> y (si aplica) el
  // bloqueo de imágenes remotas. Corre DESPUÉS de DOMPurify: como
  // ALLOW_DATA_ATTR=false, un data-blocked-src inyectado por el remitente ya
  // fue eliminado — el único que sobrevive es el que agregamos aquí, con un
  // src que ya pasó el filtro de esquemas de DOMPurify.
  return clean
    .replace(/<a\b([^>]*)>/gi, (_m, attrs: string) => {
      let a = attrs;
      if (!/\btarget\s*=/i.test(a)) a += ' target="_blank"';
      if (!/\brel\s*=/i.test(a)) a += ' rel="noopener noreferrer"';
      else a = a.replace(/\brel\s*=\s*(['"])(.*?)\1/i, 'rel="noopener noreferrer"');
      return `<a${a}>`;
    })
    .replace(/<img\b([^>]*?)(\/?)>/gi, (_m, attrs: string, selfClose: string) => {
      let a = attrs;
      const srcMatch = a.match(/\bsrc\s*=\s*(['"])(.*?)\1/i);
      const src = srcMatch?.[2] ?? "";
      if (blockImages) {
        // Solo http(s) y protocol-relative son "remotas". Las raíz-relativas
        // (/api/crm/correos/…/attachments/…) que produce rewriteCidImages NO
        // se bloquean: son adjuntos del propio hilo servidos por un endpoint
        // autenticado del tenant, no pixels de terceros.
        if (src && /^(https?:)?\/\//i.test(src)) {
          a = a.replace(
            srcMatch![0],
            `src="${BLOCKED_IMG_PLACEHOLDER}" data-blocked-src="${src}"`,
          );
        }
      }
      // Imágenes /api/ (cid reescritas) cargan en el primer paint para que el
      // iframe pueda medir altura; el resto conserva lazy.
      if (!/\bloading\s*=/i.test(a) && !src.startsWith("/api/")) {
        a += ' loading="lazy"';
      }
      return `<img${a}${selfClose}>`;
    });
}

/** true si el HTML sanitizado contiene imágenes remotas bloqueadas. */
export function hasBlockedImages(sanitizedHtml: string): boolean {
  return sanitizedHtml.includes("data-blocked-src=");
}

/** Plain legible desde HTML o texto (saltos de línea). */
export function emailPlainFallback(htmlBody: string | null, textBody: string | null): string {
  if (textBody?.trim()) return textBody.trim();
  if (!htmlBody?.trim()) return "(sin contenido)";
  return htmlBody
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<(br|\/p|\/div|\/li|\/tr|\/h[1-6])\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim() || "(sin contenido)";
}
