/**
 * Utilidades puras para presentar remitentes de correo. El header From llega
 * crudo en `thread.fromEmail` (`"Nombre Apellido" <a@b.cl>`, `Nombre <a@b.cl>`
 * o `a@b.cl`); no existe `fromName` en el DTO.
 */

export type CorreoSender = {
  name: string;
  email: string;
  initials: string;
};

/** Tamaño de la paleta categórica de avatares (tints del DS). */
export const SENDER_PALETTE_SIZE = 6;

/** Primer code point de una palabra (seguro ante acentos y surrogates). */
function firstLetter(word: string): string {
  return Array.from(word)[0] ?? "";
}

export function parseSender(fromEmail: string | null): CorreoSender {
  const raw = (fromEmail ?? "").trim();
  if (!raw) return { name: "", email: "", initials: "?" };

  // `"Nombre" <a@b>` | `Nombre <a@b>` | `a@b`
  const match = raw.match(/^"?([^"<]*)"?\s*<([^>]+)>\s*$/);
  const email = (match ? match[2] : raw).replace(/[<>]/g, "").trim();
  let name = (match ? match[1] : "").replace(/"/g, "").trim();
  if (!name) name = email.split("@")[0] ?? "";

  const words = name.split(/\s+/).filter(Boolean);
  let initials = words
    .slice(0, 2)
    .map((word) => firstLetter(word))
    .join("");
  if (!initials) initials = firstLetter(email);
  if (!initials) initials = "?";

  return { name, email, initials: initials.toUpperCase() };
}

/**
 * Índice determinístico de color por remitente: mismo email (sin importar
 * mayúsculas) → mismo color de la paleta categórica.
 */
export function senderColorIndex(email: string): number {
  const normalized = email.trim().toLowerCase();
  let sum = 0;
  for (let i = 0; i < normalized.length; i += 1) {
    sum = (sum + normalized.charCodeAt(i)) % 65536;
  }
  return sum % SENDER_PALETTE_SIZE;
}
