/**
 * Resolución de destinatarios del AVISO DE CESIÓN al deudor.
 *
 * Reemplaza el fallback silencioso a `FinanceDte.receiverEmail` (dato del
 * XML SII histórico, NO una preferencia de comunicación vigente) que
 * provocaba envíos a terceros ajenos a la relación comercial.
 *
 * Cadena (sin fallback a receiverEmail):
 *   1. Sin cuenta CRM vinculada (accountId null) → NO_ACCOUNT, lista vacía.
 *   2. Cuenta con `cesionNotificarDeudor = false` → OPTED_OUT, lista vacía.
 *   3. Contactos con `recibeCesion = true` y email no nulo → CONFIGURED.
 *   4. Sin contactos marcados → NO_CONTACTS, lista vacía.
 *
 * Multi-tenant: la query filtra SIEMPRE por tenantId + accountId juntos —
 * nunca sólo por accountId — para impedir fuga cross-tenant.
 */

import { prisma } from "@/lib/prisma";

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
  dte: { accountId: string | null },
): Promise<CesionRecipientsResult> {
  if (!dte.accountId) {
    return { emails: [], notificarDeudor: true, reason: "NO_ACCOUNT" };
  }

  // Cuenta scoped por tenant: si no pertenece a este tenant no se resuelve.
  const account = await prisma.crmAccount.findFirst({
    where: { id: dte.accountId, tenantId },
    select: { cesionNotificarDeudor: true },
  });
  if (!account) {
    return { emails: [], notificarDeudor: true, reason: "NO_ACCOUNT" };
  }
  if (!account.cesionNotificarDeudor) {
    return { emails: [], notificarDeudor: false, reason: "OPTED_OUT" };
  }

  const contacts = await prisma.crmContact.findMany({
    where: {
      tenantId,
      accountId: dte.accountId,
      recibeCesion: true,
      email: { not: null },
    },
    select: { email: true },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  });

  const emails = dedupeEmails(contacts.map((c) => c.email));
  return {
    emails,
    notificarDeudor: true,
    reason: emails.length > 0 ? "CONFIGURED" : "NO_CONTACTS",
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
