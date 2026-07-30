/**
 * Contactos externos del hilo para el plan CRM (licitación / estructura).
 *
 * To/CC no se usaban en la extracción IA: el prompt solo veía `De:` + cuerpo,
 * y el schema solo admitía un `contact`. Acá cosechamos From/To/CC excluyendo
 * dominios del tenant y mergeamos con lo que devolvió la IA.
 */
import {
  extractEmailAddresses,
  normalizeEmailAddress,
} from "@/lib/email-address";
import { domainOf } from "./correos-list-helpers";
import type {
  CrmStructureContact,
  CrmStructureProposal,
} from "./email-to-crm-structure.types";

const SYSTEM_LOCAL =
  /^(no-?reply|noreply|notificaciones|notifications?|mailer-daemon|postmaster|bounce|donotreply)$/i;

const MAX_CONTACTS = 15;

export type MessageRecipients = {
  fromEmail: string | null;
  toEmails?: string[] | null;
  ccEmails?: string[] | null;
};

/** Parsea `"Nombre" <a@b.cl>` o bare email. */
export function parseNamedEmail(raw: string | null | undefined): {
  email: string | null;
  displayName: string | null;
} {
  if (!raw?.trim()) return { email: null, displayName: null };
  const email = extractEmailAddresses(raw)[0] ?? null;
  if (!email) return { email: null, displayName: null };
  const match = raw.trim().match(/^"?([^"<]*)"?\s*<([^>]+)>\s*$/);
  const displayName = (match?.[1] ?? "").replace(/"/g, "").trim() || null;
  return { email: normalizeEmailAddress(email), displayName };
}

/** julia.fuentes → { firstName: "Julia", lastName: "Fuentes" } */
export function guessNameFromLocalPart(email: string): {
  firstName: string | null;
  lastName: string | null;
} {
  const local = (email.split("@")[0] ?? "").trim();
  if (!local || SYSTEM_LOCAL.test(local)) {
    return { firstName: null, lastName: null };
  }
  const parts = local
    .replace(/[._+]+/g, " ")
    .replace(/\d+/g, " ")
    .split(/\s+/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 2);
  if (parts.length === 0) return { firstName: null, lastName: null };
  const titled = parts.map(
    (p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase(),
  );
  if (titled.length === 1) return { firstName: titled[0], lastName: null };
  return { firstName: titled[0], lastName: titled.slice(1).join(" ") };
}

function splitDisplayName(name: string | null): {
  firstName: string | null;
  lastName: string | null;
} {
  if (!name?.trim()) return { firstName: null, lastName: null };
  const parts = name.trim().split(/\s+/);
  return parts.length === 1
    ? { firstName: parts[0], lastName: null }
    : { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function isSystemLocal(email: string): boolean {
  const local = email.split("@")[0] ?? "";
  return SYSTEM_LOCAL.test(local);
}

function isExternalEmail(
  email: string,
  tenantDomains: Set<string>,
  ownEmail: string | null,
): boolean {
  const norm = normalizeEmailAddress(email);
  if (!norm.includes("@")) return false;
  if (ownEmail && norm === normalizeEmailAddress(ownEmail)) return false;
  if (isSystemLocal(norm)) return false;
  const dom = domainOf(norm);
  if (dom && tenantDomains.has(dom)) return false;
  return true;
}

function contactFromAddress(rawOrEmail: string): CrmStructureContact | null {
  const { email, displayName } = parseNamedEmail(rawOrEmail);
  if (!email) return null;
  const fromDisplay = splitDisplayName(displayName);
  const fromLocal = guessNameFromLocalPart(email);
  return {
    firstName: fromDisplay.firstName ?? fromLocal.firstName,
    lastName: fromDisplay.lastName ?? fromLocal.lastName,
    email,
    phone: null,
    roleTitle: null,
  };
}

/**
 * Cosecha contactos externos de From/To/CC del hilo.
 * Orden: From → To → CC; dedupe por email (case-insensitive).
 */
export function harvestExternalContacts(params: {
  messages: MessageRecipients[];
  tenantDomains: Set<string>;
  ownEmail?: string | null;
}): CrmStructureContact[] {
  const own = params.ownEmail ? normalizeEmailAddress(params.ownEmail) : null;
  const seen = new Set<string>();
  const out: CrmStructureContact[] = [];

  const push = (raw: string) => {
    if (out.length >= MAX_CONTACTS) return;
    const c = contactFromAddress(raw);
    if (!c?.email) return;
    if (!isExternalEmail(c.email, params.tenantDomains, own)) return;
    if (seen.has(c.email)) return;
    seen.add(c.email);
    out.push(c);
  };

  for (const m of params.messages) {
    if (m.fromEmail) push(m.fromEmail);
  }
  for (const m of params.messages) {
    for (const e of m.toEmails ?? []) push(e);
  }
  for (const m of params.messages) {
    for (const e of m.ccEmails ?? []) push(e);
  }
  return out;
}

/** ¿El contacto tiene algo útil para crear? */
export function contactHasIdentity(c: CrmStructureContact): boolean {
  return Boolean(
    (c.email && c.email.trim()) ||
      (c.firstName && c.firstName.trim()) ||
      (c.phone && c.phone.trim()),
  );
}

function richness(c: CrmStructureContact): number {
  return (
    (c.firstName ? 1 : 0) +
    (c.lastName ? 1 : 0) +
    (c.email ? 2 : 0) +
    (c.phone ? 1 : 0) +
    (c.roleTitle && !/^En copia|^Destinatario/i.test(c.roleTitle) ? 1 : 0)
  );
}

function mergeTwo(
  a: CrmStructureContact,
  b: CrmStructureContact,
): CrmStructureContact {
  // Preferir cargo semántico sobre etiquetas de header.
  const roleA = a.roleTitle;
  const roleB = b.roleTitle;
  const preferRole = (r: string | null | undefined) =>
    r && !/^En copia|^Destinatario/i.test(r) ? r : null;
  return {
    firstName: a.firstName || b.firstName,
    lastName: a.lastName || b.lastName,
    email: a.email || b.email,
    phone: a.phone || b.phone,
    roleTitle: preferRole(roleA) || preferRole(roleB) || roleA || roleB,
    selected: a.selected === false || b.selected === false ? false : a.selected ?? b.selected,
  };
}

/**
 * Une contactos IA + headers. Misma email → merge campos; sin email se
 * conservan ambos si tienen identidad. Caps en MAX_CONTACTS.
 */
export function mergeStructureContacts(
  aiContacts: CrmStructureContact[],
  headerContacts: CrmStructureContact[],
): CrmStructureContact[] {
  const byEmail = new Map<string, CrmStructureContact>();
  const noEmail: CrmStructureContact[] = [];

  const ingest = (list: CrmStructureContact[]) => {
    for (const raw of list) {
      if (!contactHasIdentity(raw)) continue;
      const email = raw.email ? normalizeEmailAddress(raw.email) : null;
      const c: CrmStructureContact = {
        ...raw,
        email,
        selected: raw.selected !== false,
      };
      if (!email) {
        noEmail.push(c);
        continue;
      }
      const prev = byEmail.get(email);
      if (!prev) {
        byEmail.set(email, c);
        continue;
      }
      // El más rico gana como base; el otro completa huecos.
      byEmail.set(
        email,
        richness(c) >= richness(prev) ? mergeTwo(c, prev) : mergeTwo(prev, c),
      );
    }
  };

  // IA primero (nombres/firma), headers completan huecos y agregan CC/To.
  ingest(aiContacts);
  ingest(headerContacts);

  const merged = [...byEmail.values(), ...noEmail];
  return merged.slice(0, MAX_CONTACTS).map((c) => ({
    ...c,
    selected: c.selected !== false,
  }));
}

/** Lista canónica: `contacts` si hay; si no, `[contact]` cuando tiene identidad. */
export function listProposalContacts(params: {
  contact: CrmStructureContact;
  contacts?: CrmStructureContact[] | null;
}): CrmStructureContact[] {
  if (Array.isArray(params.contacts) && params.contacts.length > 0) {
    return params.contacts.filter(contactHasIdentity);
  }
  return contactHasIdentity(params.contact) ? [params.contact] : [];
}

/** Contactos marcados para crear (selected !== false). */
export function selectedProposalContacts(params: {
  contact: CrmStructureContact;
  contacts?: CrmStructureContact[] | null;
}): CrmStructureContact[] {
  return listProposalContacts(params).filter((c) => c.selected !== false);
}

/** Bloque Para/CC para inyectar en el prompt (además del harvest). */
export function formatRecipientsBlock(m: MessageRecipients): string {
  const lines: string[] = [];
  if (m.fromEmail) lines.push(`De: ${m.fromEmail}`);
  const to = (m.toEmails ?? []).filter(Boolean);
  const cc = (m.ccEmails ?? []).filter(Boolean);
  if (to.length) lines.push(`Para: ${to.join(", ")}`);
  if (cc.length) lines.push(`CC: ${cc.join(", ")}`);
  return lines.join("\n");
}

/**
 * Inyecta contactos de headers en la propuesta y reaplica deselections
 * del borrador base (por email) tras un refine.
 */
export function withHeaderContacts(
  proposal: CrmStructureProposal,
  headerContacts: CrmStructureContact[],
  baseContacts?: CrmStructureContact[] | null,
): CrmStructureProposal {
  const aiList = listProposalContacts({
    contact: proposal.contact,
    contacts: proposal.contacts,
  });
  let merged = mergeStructureContacts(aiList, headerContacts);

  if (baseContacts?.length) {
    const deselected = new Set(
      baseContacts
        .filter((c) => c.selected === false && c.email)
        .map((c) => normalizeEmailAddress(c.email!)),
    );
    if (deselected.size > 0) {
      merged = merged.map((c) =>
        c.email && deselected.has(normalizeEmailAddress(c.email))
          ? { ...c, selected: false }
          : c,
      );
    }
  }

  const primary =
    merged.find((c) => c.selected !== false) ?? merged[0] ?? proposal.contact;

  return {
    ...proposal,
    contacts: merged,
    contact: primary,
  };
}
