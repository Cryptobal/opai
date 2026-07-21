import DOMPurify from "isomorphic-dompurify";

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

/** Sanitiza HTML de correo: sin scripts; links externos seguros; imgs lazy. */
export function sanitizeEmailHtml(html: string): string {
  if (!html.trim()) return "";
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "input", "style"],
    FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover"],
  });
  // Post-pass: forzar target/rel en <a> y loading en <img>.
  return clean
    .replace(/<a\b([^>]*)>/gi, (_m, attrs: string) => {
      let a = attrs;
      if (!/\btarget\s*=/i.test(a)) a += ' target="_blank"';
      if (!/\brel\s*=/i.test(a)) a += ' rel="noopener noreferrer"';
      else a = a.replace(/\brel\s*=\s*(['"])(.*?)\1/i, 'rel="noopener noreferrer"');
      return `<a${a}>`;
    })
    .replace(/<img\b([^>]*)>/gi, (_m, attrs: string) => {
      let a = attrs;
      if (!/\bloading\s*=/i.test(a)) a += ' loading="lazy"';
      return `<img${a}>`;
    });
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
