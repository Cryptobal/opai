/**
 * Nombres de archivo consistentes para PDFs de cotización / propuesta técnica:
 * Cliente - Instalación - [Nombre cotización] - Código [ - sufijo ].pdf
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
  const inst = sanitizePdfFileNameSegment(
    (options.installationName || "").trim() || "Sin instalación",
    60,
  );
  const code = sanitizePdfFileNameSegment(options.quoteCode || "cotizacion", 40);
  const parts: string[] = [client, inst];
  const qn = options.quoteName?.trim();
  if (qn) parts.push(sanitizePdfFileNameSegment(qn, 60));
  parts.push(code);
  if (options.suffix?.trim()) {
    parts.push(sanitizePdfFileNameSegment(options.suffix, 40));
  }
  let base = parts.join(" - ");
  const maxBase = 180;
  if (base.length > maxBase) base = base.slice(0, maxBase).trim();
  return `${base}.pdf`;
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
