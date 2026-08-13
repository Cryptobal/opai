/**
 * Reescritura de recursos remotos del HTML de correo (imágenes / fondos).
 * Corre en el cliente (post-DOMPurify). El proxy autenticado evita hotlink
 * y referrer que Gmail resuelve con googleusercontent.
 */

export const EMAIL_REMOTE_IMAGE_PATH = "/api/crm/correos/remote-image";

export function isHttpRemoteUrl(src: string): boolean {
  return /^(https?:)?\/\//i.test(src.trim());
}

export function absoluteHttpUrl(src: string): string | null {
  const t = decodeHtmlAttr(src.trim());
  if (/^https?:\/\//i.test(t)) return t;
  if (t.startsWith("//")) return `https:${t}`;
  return null;
}

export function proxiedEmailImageSrc(remote: string): string {
  const abs = absoluteHttpUrl(remote);
  if (!abs) return remote;
  return `${EMAIL_REMOTE_IMAGE_PATH}?u=${encodeURIComponent(abs)}`;
}

export function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;");
}

function decodeHtmlAttr(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function mapRemoteOrKeep(url: string, block: boolean): string {
  if (!isHttpRemoteUrl(url)) return url;
  if (block) return "";
  return proxiedEmailImageSrc(url);
}

/** Reescribe cada URL de un srcset (`url 1x, url2 2x`). */
export function rewriteSrcset(value: string, block: boolean): string {
  return value
    .split(",")
    .map((part) => {
      const trimmed = part.trim();
      if (!trimmed) return part;
      const m = trimmed.match(/^(\S+)(\s+.*)?$/);
      if (!m) return part;
      const next = mapRemoteOrKeep(m[1]!, block);
      if (block && isHttpRemoteUrl(m[1]!)) return "";
      return `${next}${m[2] ?? ""}`;
    })
    .filter((p) => p.trim().length > 0)
    .join(", ");
}

/**
 * Reescribe `url(...)` en CSS inline. Con block, las remotas pasan a `none`.
 * `cid:` y `/api/` no se tocan aquí (cid ya se resolvió antes del sanitize).
 */
export function rewriteCssUrls(css: string, block: boolean): string {
  return css.replace(
    /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi,
    (full, quote: string, raw: string) => {
      const url = raw.trim();
      if (!isHttpRemoteUrl(url)) return full;
      if (block) return "none";
      const proxied = proxiedEmailImageSrc(url);
      return `url(${quote}${proxied}${quote})`;
    },
  );
}

/**
 * Post-pass sobre HTML ya sanitizado: proxy o bloqueo de src/srcset/background
 * y url() en style. Las rutas `/api/` (cid reescritas) no son remotas.
 */
export function rewriteEmailRemoteResources(
  html: string,
  options: { blockRemoteImages: boolean },
): string {
  const block = options.blockRemoteImages;
  let out = html;
  if (!block) {
    out = out.replace(
      /\bsrc\s*=\s*(['"])(.*?)\1/gi,
      (full, q: string, src: string) => {
        if (!isHttpRemoteUrl(src)) return full;
        return `src=${q}${escapeHtmlAttr(proxiedEmailImageSrc(src))}${q}`;
      },
    );
  }
  out = out.replace(
    /\bsrcset\s*=\s*(['"])(.*?)\1/gi,
    (full, q: string, value: string) => {
      const next = rewriteSrcset(value, block);
      if (block && !next.trim()) return `srcset=${q}${q}`;
      return `srcset=${q}${escapeHtmlAttr(next)}${q}`;
    },
  );
  out = out.replace(
    /\bbackground\s*=\s*(['"])(.*?)\1/gi,
    (full, q: string, src: string) => {
      if (!isHttpRemoteUrl(src) && !/^https?:/i.test(src.trim())) return full;
      if (!isHttpRemoteUrl(src)) return full;
      if (block) {
        return `data-blocked-bg=${q}${escapeHtmlAttr(absoluteHttpUrl(src) ?? src)}${q}`;
      }
      return `background=${q}${escapeHtmlAttr(proxiedEmailImageSrc(src))}${q}`;
    },
  );
  out = out.replace(
    /\bstyle\s*=\s*(['"])(.*?)\1/gi,
    (full, q: string, css: string) => {
      const next = rewriteCssUrls(css, block);
      if (next === css) return full;
      return `style=${q}${next}${q}`;
    },
  );
  return out;
}
