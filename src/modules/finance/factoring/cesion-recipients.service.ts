/**
 * Resolución de destinatarios del AVISO DE CESIÓN al deudor.
 *
 * Reemplaza el fallback silencioso a `FinanceDte.receiverEmail` (dato del
 * XML SII histórico, NO una preferencia de comunicación vigente) que
 * provocaba envíos a terceros ajenos a la relación comercial.
 *
 * Cadena (sin fallback a receiverEmail):
 *   1. Resuelve la cuenta por `crmAccountId`; para DTEs históricos, por RUT.
 *   2. Cuenta con `cesionNotificarDeudor = false` → conserva correos para el
 *      AEC, pero suprime el envío del aviso.
 *   3. Contactos con `recibeCesion = true` y email no nulo → CONFIGURED.
 *   4. Sin contactos marcados → NO_CONTACTS, lista vacía.
 *
 * Multi-tenant: la query filtra SIEMPRE por tenantId + accountId juntos —
 * nunca sólo por accountId — para impedir fuga cross-tenant.
 */

import { prisma } from "@/lib/prisma";
import { cleanRut } from "@/lib/chile-rut";

export type CesionRecipientsReason =
  | "CONFIGURED"
  | "NO_ACCOUNT"
  | "NO_CONTACTS"
  | "OPTED_OUT";

export interface CesionRecipientsResult {
  /** Correos de contactos marcados para cesión, orden isPrimary desc / createdAt asc. */
  emails: string[];
  /** Default por-cliente (CrmAccount.cesionNotificarDeudor). */
  notificarDeudor: boolean;
  reason: CesionRecipientsReason;
  /** Todos los correos de la cuenta CRM, para elegirlos en el modal. */
  contacts: Array<{
    id: string;
    name: string;
    email: string;
    recibeCesion: boolean;
  }>;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Dedup case-insensitive preservando orden; descarta inválidos/vacíos. */
function dedupeEmails(raw: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const e = (item ?? "").trim();
    if (!e || !EMAIL_RE.test(e)) continue;
    const key = e.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

export async function resolveCesionRecipients(
  tenantId: string,
  dte: { crmAccountId: string | null; receiverRut?: string | null },
): Promise<CesionRecipientsResult> {
  let account: { id: string; cesionNotificarDeudor: boolean } | null = null;

  if (dte.crmAccountId) {
    account = await prisma.crmAccount.findFirst({
      where: { id: dte.crmAccountId, tenantId },
      select: { id: true, cesionNotificarDeudor: true },
    });
  } else {
    // Compatibilidad con DTEs históricos emitidos antes de persistir
    // crmAccountId. El RUT se normaliza en ambos lados porque existen cuentas
    // antiguas con puntos, guion o caracteres invisibles.
    const receiverRut = cleanRut(dte.receiverRut ?? "");
    if (receiverRut) {
      const candidates = await prisma.crmAccount.findMany({
        where: { tenantId, rut: { not: null } },
        select: { id: true, rut: true, cesionNotificarDeudor: true },
      });
      account =
        candidates.find((candidate) => cleanRut(candidate.rut ?? "") === receiverRut) ??
        null;
    }
  }

  if (!account) {
    return {
      emails: [],
      notificarDeudor: true,
      reason: "NO_ACCOUNT",
      contacts: [],
    };
  }

  const contacts = await prisma.crmContact.findMany({
    where: {
      tenantId,
      accountId: account.id,
      email: { not: null },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      recibeCesion: true,
    },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  });

  const seen = new Set<string>();
  const contactOptions: CesionRecipientsResult["contacts"] = [];
  for (const contact of contacts) {
    const email = dedupeEmails([contact.email])[0];
    if (!email) continue;
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    contactOptions.push({
      id: contact.id,
      name:
        [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim() ||
        email,
      email,
      recibeCesion: contact.recibeCesion,
    });
  }
  const emails = contactOptions
    .filter((contact) => contact.recibeCesion)
    .map((contact) => contact.email);
  return {
    emails,
    notificarDeudor: account.cesionNotificarDeudor,
    reason: !account.cesionNotificarDeudor
      ? "OPTED_OUT"
      : emails.length > 0
        ? "CONFIGURED"
        : "NO_CONTACTS",
    contacts: contactOptions,
  };
}

export interface CesionAvisoDecision {
  /** Lista final ordenada. El primero alimenta el <eMailDeudor> del AEC. */
  deudorEmailList: string[];
  /** ¿Enviar el aviso de cesión propio de OPAI? */
  notificarDeudor: boolean;
  /** true sólo si hay destinatarios Y no está suprimido por opt-out. */
  willSend: boolean;
  reason: CesionRecipientsReason | "EXPLICIT";
}

/**
 * Decide la lista final de destinatarios y si se envía el aviso, a partir de
 * la entrada de la operación y la resolución CRM. Pura y testeable: encapsula
 * la precedencia (lista explícita del modal > contactos CRM) y el opt-out,
 * SIN fallback a `dte.receiverEmail` (causa raíz del incidente). Nunca inventa
 * destinatarios: si no hay lista explícita ni contactos configurados, vacío.
 */
export function decideCesionAviso(params: {
  /** Lista explícita del modal (aunque sea []). undefined = resolver por CRM. */
  explicitEmails?: string[];
  /** Override de opt-out de la operación. undefined = default del cliente. */
  explicitNotificar?: boolean;
  /** Resultado de resolveCesionRecipients, o null si vino lista explícita. */
  resolved: CesionRecipientsResult | null;
}): CesionAvisoDecision {
  const fromExplicit = params.explicitEmails !== undefined;
  const deudorEmailList = fromExplicit
    ? dedupeEmails(params.explicitEmails as string[])
    : (params.resolved?.emails ?? []);
  const notificarDeudor =
    params.explicitNotificar !== undefined
      ? params.explicitNotificar
      : fromExplicit
        ? true
        : (params.resolved?.notificarDeudor ?? true);
  return {
    deudorEmailList,
    notificarDeudor,
    willSend: deudorEmailList.length > 0 && notificarDeudor,
    reason: fromExplicit ? "EXPLICIT" : (params.resolved?.reason ?? "NO_ACCOUNT"),
  };
}
