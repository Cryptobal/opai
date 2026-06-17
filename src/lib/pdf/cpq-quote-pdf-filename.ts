/**
 * Nombres de archivo consistentes para PDFs de cotización / propuesta técnica:
 * Cuenta - Código cotización - [Nombre cotización] [ - sufijo ].pdf
 */

const ILLEGAL_FILE_CHARS = /[/\\?%*:|"<>]/g;

export function sanitizePdfFileNameSegment(raw: string, maxLen = 80): string {
  const t = raw
    .trim()
    .replace(ILLEGAL_FILE_CHARS, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return "—";
  return t.length > maxLen ? t.slice(0, maxLen).trim() : t;
}

export function buildCpqQuotePdfFileName(options: {
  clientName: string;
  installationName: string;
  quoteName?: string | null | undefined;
  quoteCode: string;
  /** Opcional: segmento extra antes de .pdf (p. ej. variante) */
  suffix?: string | null;
}): string {
  const client = sanitizePdfFileNameSegment(options.clientName || "Cliente", 60);
  const code = sanitizePdfFileNameSegment(options.quoteCode || "cotizacion", 40);
  const parts: string[] = [client, code];
  const qn = options.quoteName?.trim();
  if (qn) parts.push(sanitizePdfFileNameSegment(qn, 80));
  if (options.suffix?.trim()) {
    parts.push(sanitizePdfFileNameSegment(options.suffix, 40));
  }
  let base = parts.join(" - ");
  const maxBase = 180;
  if (base.length > maxBase) base = base.slice(0, maxBase).trim();
  return `${base}.pdf`;
}

/**
 * Construye un header `Content-Disposition` seguro para HTTP.
 *
 * Los headers HTTP solo aceptan caracteres Latin-1 (ByteString, 0-255). Un
 * nombre de archivo con caracteres como "–" (en dash, U+2013 = 8211), "“", "—"
 * o emojis hace que `new Response(..., { headers })` lance:
 *   "Cannot convert argument to a ByteString because the character at index N
 *    has a value of X which is greater than 255."
 *
 * Solución estándar (RFC 5987 / RFC 6266): un `filename="..."` ASCII puro como
 * fallback + un `filename*=UTF-8''...` percent-encoded para clientes modernos.
 */
export function buildContentDisposition(
  fileName: string,
  disposition: "inline" | "attachment" = "attachment",
): string {
  const clean = (fileName || "archivo")
    .replace(/[\\/\x00-\x1f"]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200) || "archivo";
  // Fallback ASCII: cualquier caracter fuera de 0x20-0x7E se reemplaza por "-".
  const ascii = clean.replace(/[^\x20-\x7E]/g, "-") || "archivo";
  const encoded = encodeURIComponent(clean);
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

/** Extrae el nombre de archivo de Content-Disposition (incl. filename*=UTF-8'') */
export function parseContentDispositionFileName(
  disposition: string | null | undefined,
): string | undefined {
  if (!disposition) return undefined;
  const star = disposition.match(/filename\*\s*=\s*UTF-8''([^;\s]+)/i);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1]);
    } catch {
      /* fallthrough */
    }
  }
  const quoted = disposition.match(/filename\s*=\s*"((?:\\.|[^"\\])*)"/i);
  if (quoted?.[1]) return quoted[1].replace(/\\(.)/g, "$1");
  const simple = disposition.match(/filename\s*=\s*([^;\n]+)/i);
  if (simple?.[1]) return simple[1].trim().replace(/^["']|["']$/g, "");
  return undefined;
}
