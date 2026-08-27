/**
 * Destinatarios del email PDF+XML de un DTE.
 *
 * Puro (sin Prisma): lo consume el enrutado de emisión/envío y la UI
 * de plantilla/picker para avisar emails que no pertenecen a la cuenta.
 *
 * Un destinatario es válido si:
 *   - es email de un contacto CRM de la cuenta, o
 *   - es casilla automática de recepción DTE (portales / recepciondte*).
 *
 * No exige `recibeFacturacion`: ese flag solo SUMA contactos; no es el
 * filtro. Un CC congelado en la plantilla que sí es contacto se conserva.
 */
import { normalizeEmailAddress, normalizeEmailList } from "@/lib/email-address";

/** Hosts de portales de recepción DTE (casilla automática, no persona). */
const DTE_PORTAL_HOST_RE =
  /(?:^|\.)(febos|accepta|paperless|suiteelectronica|einvoicing)(?:\.|$)/i;

/**
 * Casillas típicas de recepción DTE: local `recepciondte*` / `dte@` /
 * `xml@`, o host de portal (Febos, Accepta, Paperless, Suite Electrónica,
 * eInvoicing).
 */
export function isDteReceptionEmail(email: string): boolean {
  const e = normalizeEmailAddress(email);
  const at = e.lastIndexOf("@");
  if (at < 1) return false;
  const host = e.slice(at + 1);
  if (
    e.includes("recepciondte") ||
    e.includes("recepcion_dte") ||
    e.includes("recepcion.dte") ||
    e.includes("dte.recepcion") ||
    e.startsWith("dte@") ||
    e.startsWith("xml@")
  ) {
    return true;
  }
  return DTE_PORTAL_HOST_RE.test(host);
}

/**
 * ¿Este email puede ir en TO/CC automático de la cuenta?
 * Contacto CRM (cualquier flag) o casilla DTE.
 */
export function isLinkedDteRecipient(
  email: string,
  accountContactEmails: Iterable<string>,
): boolean {
  const e = normalizeEmailAddress(email);
  if (!e.includes("@")) return false;
  if (isDteReceptionEmail(e)) return true;
  const allowed = new Set(normalizeEmailList([...accountContactEmails]));
  return allowed.has(e);
}

export type FilteredDteRecipients = {
  to: string | null;
  cc: string[];
  dropped: string[];
  adjusted: boolean;
};

/**
 * Quita TO/CC que no son contacto de la cuenta ni casilla DTE.
 * `explicitEmails` (override del modal de reenvío) nunca se descartan.
 *
 * Si el TO cae, promueve el primer CC que sobrevivió — nunca el primer
 * CC crudo (que podía ser un tercero ajeno a la cuenta).
 */
export function filterUnlinkedDteRecipients(input: {
  to?: string | null;
  cc?: string[] | null;
  accountEmails: Iterable<string>;
  explicitEmails?: string[] | null;
}): FilteredDteRecipients {
  const account = new Set(normalizeEmailList([...input.accountEmails]));
  const explicit = new Set(normalizeEmailList(input.explicitEmails ?? []));

  const keep = (raw: string | null | undefined): string | null => {
    if (!raw?.trim()) return null;
    const e = normalizeEmailAddress(raw);
    if (!e.includes("@")) return null;
    if (explicit.has(e) || account.has(e) || isDteReceptionEmail(e)) return e;
    return null;
  };

  const originalTo = input.to?.trim()
    ? normalizeEmailAddress(input.to)
    : null;
  const originalCc = normalizeEmailList(input.cc ?? []);

  const dropped: string[] = [];
  let to = keep(input.to);
  if (originalTo && !to) dropped.push(originalTo);

  const cc: string[] = [];
  for (const raw of originalCc) {
    const kept = keep(raw);
    if (!kept) {
      dropped.push(raw);
      continue;
    }
    if (kept === to || cc.includes(kept)) continue;
    cc.push(kept);
  }

  if (!to && cc.length > 0) {
    to = cc[0]!;
    cc.shift();
  }

  const ccKey = (list: string[]) => list.join("|");
  const adjusted =
    dropped.length > 0 ||
    (originalTo ?? "") !== (to ?? "") ||
    ccKey(originalCc.filter((e) => e !== originalTo)) !== ccKey(cc);

  return { to, cc, dropped, adjusted };
}

export type DteEmailSendKind =
  | "AUTO_RECEIVER"
  | "AUTO_BACKOFFICE"
  | "MANUAL_RESEND"
  | "MANUAL_OVERRIDE_RECIPIENT"
  | "MANUAL_BACKOFFICE";

/**
 * Emails que el usuario AGREGÓ en el modal (no estaban en el DTE).
 * El default persistido se filtra contra CRM; un extra tipeado se respeta.
 * Auto-envío no tiene override.
 */
export function explicitDteEmailsForSend(
  kind: DteEmailSendKind,
  recipientEmail?: string,
  ccOverride?: string[],
  storedTo?: string | null,
  storedCc?: string[] | null,
): string[] {
  if (kind !== "MANUAL_RESEND" && kind !== "MANUAL_OVERRIDE_RECIPIENT") {
    return [];
  }
  const stored = new Set(
    normalizeEmailList([
      ...(storedTo?.trim() ? [storedTo] : []),
      ...(storedCc ?? []),
    ]),
  );
  const candidates: string[] = [];
  if (recipientEmail?.trim()) candidates.push(recipientEmail);
  if (ccOverride) candidates.push(...ccOverride);
  return candidates.filter((e) => {
    const n = normalizeEmailAddress(e);
    return Boolean(n) && !stored.has(n);
  });
}

export type DteResendRecipientRole = "xml_mailbox" | "billing" | "other";

export type DteResendContactOption = {
  email: string;
  label: string;
  role: DteResendRecipientRole;
};

export type PartitionedDteResendRecipients = {
  xmlMailbox: string[];
  others: string[];
};

/**
 * Parte destinatarios de un reenvío manual: casilla XML (facturador
 * electrónico / portal DTE) vs personas. La casilla recibe solo XML;
 * el resto recibe XML + factura (PDF).
 */
export function partitionDteResendRecipients(
  emails: string[],
): PartitionedDteResendRecipients {
  const xmlMailbox: string[] = [];
  const others: string[] = [];
  for (const email of normalizeEmailList(emails)) {
    if (!email.includes("@")) continue;
    if (isDteReceptionEmail(email)) xmlMailbox.push(email);
    else others.push(email);
  }
  return { xmlMailbox, others };
}

function contactDisplayName(
  firstName?: string | null,
  lastName?: string | null,
  email?: string,
): string {
  const name = [firstName, lastName].filter(Boolean).join(" ").trim();
  return name || email || "";
}

/**
 * Arma la lista de contactos del modal "Reenviar XML":
 * casillas DTE primero, luego facturación, luego el resto.
 * Incluye emails persistidos en el DTE aunque no estén en el CRM.
 */
export function buildDteResendContactOptions(input: {
  contacts?: Array<{
    email?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    recibeFacturacion?: boolean | null;
  }> | null;
  storedEmails?: string[] | null;
}): DteResendContactOption[] {
  const byEmail = new Map<string, DteResendContactOption>();

  const upsert = (
    rawEmail: string | null | undefined,
    patch: Partial<Pick<DteResendContactOption, "label" | "role">>,
  ) => {
    const email = normalizeEmailAddress(rawEmail ?? "");
    if (!email.includes("@")) return;
    const prev = byEmail.get(email);
    const role: DteResendRecipientRole =
      patch.role === "xml_mailbox" || isDteReceptionEmail(email)
        ? "xml_mailbox"
        : patch.role === "billing" || prev?.role === "billing"
          ? "billing"
          : prev?.role ?? "other";
    const label = patch.label?.trim() || prev?.label || email;
    byEmail.set(email, { email, label, role });
  };

  for (const c of input.contacts ?? []) {
    const email = normalizeEmailAddress(c.email ?? "");
    if (!email.includes("@")) continue;
    upsert(email, {
      label: contactDisplayName(c.firstName, c.lastName, email),
      role: isDteReceptionEmail(email)
        ? "xml_mailbox"
        : c.recibeFacturacion
          ? "billing"
          : "other",
    });
  }

  for (const raw of input.storedEmails ?? []) {
    upsert(raw, {});
  }

  const roleRank: Record<DteResendRecipientRole, number> = {
    xml_mailbox: 0,
    billing: 1,
    other: 2,
  };
  return [...byEmail.values()].sort((a, b) => {
    const rank = roleRank[a.role] - roleRank[b.role];
    if (rank !== 0) return rank;
    return a.label.localeCompare(b.label, "es");
  });
}

/** Pre-marca la casilla XML (facturador electrónico). El resto lo elige el usuario. */
export function defaultDteResendSelection(
  options: DteResendContactOption[],
): string[] {
  return options.filter((o) => o.role === "xml_mailbox").map((o) => o.email);
}
