/**
 * Formato de fecha y snippet de la cadena del lector.
 * Puro: sin React, testeable y compartido por fila colapsada y mensaje abierto.
 */
import { emailPlainFallback } from "@/lib/sanitize-email-html";

/** Primeras palabras del cuerpo (fila colapsada, estilo Gmail). */
export function messageSnippet(m: {
  htmlBody: string | null;
  textBody: string | null;
}): string {
  const plain = emailPlainFallback(m.htmlBody, m.textBody);
  return plain.replace(/\s+/g, " ").trim().slice(0, 120);
}

/** Fecha completa (mensaje abierto y `title` de las filas colapsadas). */
export function formatMessageDateFull(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" });
}

/**
 * Fecha corta de fila colapsada: hoy → `HH:mm`; año en curso → `d MMM`;
 * otro año → `d MMM yyyy`.
 */
export function formatMessageDateShort(iso: string | null, now: Date = new Date()): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
  }
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString("es-CL", { day: "numeric", month: "short" });
  }
  return d.toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" });
}
