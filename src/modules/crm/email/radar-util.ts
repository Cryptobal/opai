import { createHash } from "crypto";

/** Hash corto y estable para dedupeKeys (señales, compromisos). */
export function shortHash(input: string): string {
  return createHash("sha1").update(input).digest("hex").slice(0, 10);
}

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

/** Parsea una fecha ISO (YYYY-MM-DD) a Date UTC a mediodía; null si inválida. */
export function parseISODate(iso: string | null | undefined): Date | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(`${iso}T12:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Fecha de hoy (YYYY-MM-DD) en zona horaria de Chile (America/Santiago). */
export function hoyISO(now: Date): string {
  // en-CA formatea como YYYY-MM-DD; el timeZone evita el corrimiento de día por UTC.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(now);
}
