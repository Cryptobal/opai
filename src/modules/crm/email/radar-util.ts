import { createHash } from "crypto";

/** Re-export temporal: consumidores nuevos usan email-text-util. */
export { clampText, stripHtml, hoyISO } from "./email-text-util";

/** Hash corto y estable para dedupeKeys (señales, compromisos). */
export function shortHash(input: string): string {
  return createHash("sha1").update(input).digest("hex").slice(0, 10);
}

/** Parsea una fecha ISO (YYYY-MM-DD) a Date UTC a mediodía; null si inválida. */
export function parseISODate(iso: string | null | undefined): Date | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(`${iso}T12:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}
