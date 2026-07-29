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

/** Fecha de hoy (YYYY-MM-DD) en zona horaria de Chile (America/Santiago). */
export function hoyISO(now: Date): string {
  // en-CA formatea como YYYY-MM-DD; el timeZone evita el corrimiento de día por UTC.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(now);
}
