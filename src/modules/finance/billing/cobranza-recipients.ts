/**
 * ¿A quién le cobramos? Cascada canónica de destinatarios de cobranza.
 *
 * Un cliente puede tener muchos contactos y solo algunos corresponden para
 * hablar de plata. La cascada, de más específica a más genérica:
 *
 *   1. `CrmAccount.contactoCobranzaId` — elección explícita del operador.
 *   2. Contactos con `recibeCobranza = true` — configuración por flag (N).
 *   3. Contacto principal (`isPrimary`) — fallback razonable.
 *   4. Nadie: el caller debe avisar en vez de inventar un destinatario.
 *
 * La elección explícita NUNCA se sobreescribe, ni siquiera si el contacto no
 * tiene email ni teléfono: en cobranza mandarle el aviso a otra persona porque
 * la elegida está incompleta es peor que no mandarlo. En ese caso el resultado
 * viene con `source: "explicit"` y los canales vacíos, para que el caller
 * reporte "el contacto de cobranza no tiene email" y alguien lo arregle.
 *
 * Es channel-agnostic a propósito: decide la PERSONA. Cada canal (email /
 * WhatsApp) filtra después por el dato que necesita usando `emails` / `phones`.
 */

/** Subset de `CrmContact` que necesita la cascada. */
export interface CobranzaContactInput {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  recibeCobranza?: boolean | null;
  isPrimary?: boolean | null;
}

/** Nivel de la cascada que resolvió el destinatario. */
export type CobranzaRecipientSource = "explicit" | "flag" | "primary" | "none";

export interface CobranzaRecipients {
  source: CobranzaRecipientSource;
  /** Contactos elegidos (1 en `explicit`/`primary`, N en `flag`). */
  contacts: CobranzaContactInput[];
  /** Emails únicos y normalizados de esos contactos. */
  emails: string[];
  /** Teléfonos únicos, tal como están guardados (el canal los normaliza). */
  phones: string[];
}

function cleanEmail(raw: string | null | undefined): string | null {
  const s = raw?.trim().toLowerCase();
  if (!s) return null;
  // Filtro mínimo de forma: evita colar "n/a" o "-" como destinatario.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : null;
}

function cleanPhone(raw: string | null | undefined): string | null {
  const s = raw?.trim();
  if (!s) return null;
  // Al menos 8 dígitos: descarta placeholders tipo "-" o "sin teléfono".
  return s.replace(/\D/g, "").length >= 8 ? s : null;
}

function uniq(values: (string | null)[]): string[] {
  return [...new Set(values.filter((v): v is string => v != null))];
}

function build(
  source: CobranzaRecipientSource,
  contacts: CobranzaContactInput[],
): CobranzaRecipients {
  return {
    source,
    contacts,
    emails: uniq(contacts.map((c) => cleanEmail(c.email))),
    phones: uniq(contacts.map((c) => cleanPhone(c.phone))),
  };
}

/**
 * Resuelve la cascada sobre una lista de contactos ya cargada. Pura: la usan
 * tanto el servidor (envío) como la UI (mostrar a quién se le va a cobrar).
 */
export function pickCobranzaRecipients(args: {
  /** `CrmAccount.contactoCobranzaId`. */
  contactoCobranzaId?: string | null;
  /** Contactos de la cuenta (ya scopeados por tenant por el caller). */
  contacts: CobranzaContactInput[];
}): CobranzaRecipients {
  const contacts = args.contacts ?? [];

  if (args.contactoCobranzaId) {
    const explicit = contacts.find((c) => c.id === args.contactoCobranzaId);
    // Si el id apunta a un contacto que ya no está en la cuenta (borrado, o
    // movido a otro cliente) seguimos con la cascada: no hay intención viva
    // que respetar.
    if (explicit) return build("explicit", [explicit]);
  }

  const flagged = contacts.filter((c) => c.recibeCobranza === true);
  if (flagged.length > 0) return build("flag", flagged);

  const primary = contacts.filter((c) => c.isPrimary === true);
  if (primary.length > 0) return build("primary", primary);

  return build("none", []);
}

/** Texto corto para explicar de dónde salió el destinatario (UI / logs). */
export function describeCobranzaSource(source: CobranzaRecipientSource): string {
  switch (source) {
    case "explicit":
      return "Contacto de cobranza del cliente";
    case "flag":
      return "Contactos marcados para cobranza";
    case "primary":
      return "Contacto principal del cliente";
    case "none":
      return "Sin destinatario de cobranza";
  }
}
