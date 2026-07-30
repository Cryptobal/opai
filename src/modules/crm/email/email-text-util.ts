/** Utilidades de texto para pipelines de correo / IA (sin dependencia del Radar). */

/** Recorta texto a n caracteres (para acotar tokens de la IA). */
export function clampText(s: string | null | undefined, n: number): string {
  const t = (s || "").trim();
  return t.length > n ? t.slice(0, n) : t;
}

/** Quita etiquetas HTML dejando texto plano legible. */
export function stripHtml(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Decodifica entidades HTML frecuentes en celdas de correo. */
function decodeBasicEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return Number.isFinite(code) ? String.fromCharCode(code) : "";
    });
}

/** Texto de una celda: colapsa whitespace y tags internos. */
function cellText(cellHtml: string): string {
  const plain = decodeBasicEntities(cellHtml.replace(/<[^>]+>/g, " "));
  return plain.replace(/\s+/g, " ").trim();
}

/** Convierte un `<table>` a markdown de pipes (una fila por `<tr>`). */
function tableToMarkdown(tableHtml: string): string {
  const rows: string[] = [];
  const trRe = /<tr[\s\S]*?>[\s\S]*?<\/tr>/gi;
  let trMatch: RegExpExecArray | null;
  while ((trMatch = trRe.exec(tableHtml)) !== null) {
    const tr = trMatch[0];
    const cells: string[] = [];
    const cellRe = /<(td|th)[\s\S]*?>[\s\S]*?<\/\1>/gi;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellRe.exec(tr)) !== null) {
      cells.push(cellText(cellMatch[0]));
    }
    if (cells.length === 0) continue;
    rows.push(`| ${cells.join(" | ")} |`);
  }
  return rows.join("\n");
}

/**
 * HTML → texto preservando tablas como markdown (pipes).
 * El resto del documento se limpia como `stripHtml`.
 * Tablas anidadas / colspan: celdas en orden de aparición; tablas vacías se omiten.
 */
export function htmlToTextWithTables(html: string | null | undefined): string {
  if (!html) return "";
  const cleaned = html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ");

  const parts: string[] = [];
  const tableRe = /<table[\s\S]*?>[\s\S]*?<\/table>/gi;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = tableRe.exec(cleaned)) !== null) {
    const before = cleaned.slice(last, match.index);
    const beforeText = stripHtml(before);
    if (beforeText) parts.push(beforeText);
    const md = tableToMarkdown(match[0]);
    if (md) parts.push(md);
    last = match.index + match[0].length;
  }
  const after = stripHtml(cleaned.slice(last));
  if (after) parts.push(after);
  return parts.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Fecha de hoy (YYYY-MM-DD) en zona horaria de Chile (America/Santiago). */
export function hoyISO(now: Date): string {
  // en-CA formatea como YYYY-MM-DD; el timeZone evita el corrimiento de día por UTC.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(now);
}
