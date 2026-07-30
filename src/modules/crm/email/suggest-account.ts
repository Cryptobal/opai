import { prisma } from "@/lib/prisma";
import { extractEmailAddresses, normalizeEmailAddress } from "@/lib/email-address";
import { getTenantCompanyConfig } from "@/lib/tenant-config";
import {
  buildTenantDomains,
  domainOf as domainOfHeader,
  isPublicMailDomain,
} from "@/modules/crm/email/correos-list-helpers";

export type AccountSuggestion = {
  id: string;
  name: string;
  reason: string;
  confidence: "alta" | "media";
  /** Hilos que originaron la sugerencia (p. ej. previos del mismo remitente). */
  evidenceThreadIds?: string[];
};

/** Dominios de correo personales: no identifican una cuenta. */
const GENERIC_DOMAINS = new Set([
  "gmail.com", "hotmail.com", "outlook.com", "yahoo.com", "yahoo.es",
  "live.com", "icloud.com", "me.com", "proton.me", "gmx.com",
]);

const RUT_RE = /\b(\d{1,2}\.?\d{3}\.?\d{3}-[\dkK])\b/;

function domainOf(email: string | null | undefined): string | null {
  const at = (email ?? "").lastIndexOf("@");
  if (at < 0) return null;
  const d = email!.slice(at + 1).trim().toLowerCase();
  return d && !GENERIC_DOMAINS.has(d) ? d : null;
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function websiteDomain(website: string | null | undefined): string | null {
  if (!website) return null;
  const raw = website.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "");
  const host = raw.split("/")[0]?.split("?")[0] ?? "";
  if (!host || !host.includes(".")) return null;
  return isPublicMailDomain(host) ? null : host;
}

type OwnTenant = {
  domains: Set<string>;
  names: Set<string>;
};

async function loadOwnTenant(tenantId: string): Promise<OwnTenant> {
  const [company, tenant, mailboxes] = await Promise.all([
    getTenantCompanyConfig(tenantId),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
    prisma.crmEmailAccount.findMany({
      where: { tenantId, provider: "gmail", status: "active" },
      select: { email: true },
      take: 20,
    }),
  ]);

  const domains = buildTenantDomains(company, mailboxes[0]?.email ?? null);
  for (const m of mailboxes) {
    const d = domainOfHeader(m.email);
    if (d && !isPublicMailDomain(d)) domains.add(d);
  }
  const web = websiteDomain(company.website);
  if (web) domains.add(web);

  const names = new Set<string>();
  for (const n of [
    tenant?.name,
    company.companyName,
    company.commercialName,
    company.razonSocial,
  ]) {
    if (n && n.trim() && n !== "Mi Empresa" && n !== "Empresa Sin Configurar") {
      names.add(normalizeName(n));
    }
  }
  return { domains, names };
}

function isOwnCompanyAccount(
  account: { name: string; website?: string | null },
  own: OwnTenant,
): boolean {
  if (own.names.has(normalizeName(account.name))) return true;
  const web = websiteDomain(account.website);
  return Boolean(web && own.domains.has(web));
}

/** fromEmail almacenado como `"Nombre" <a@b.cl>` — contains en SQL + filtro exacto. */
function messageHasExactFrom(
  fromEmail: string | null | undefined,
  emails: Set<string>,
): boolean {
  for (const e of extractEmailAddresses(fromEmail)) {
    if (emails.has(normalizeEmailAddress(e))) return true;
  }
  return false;
}

/**
 * Sugiere cuentas para asociar un hilo (Copiloto v4):
 * 1) email exacto de contacto (alta)
 * 2) RUT en cuerpo/adjunto
 * 3) hilos previos del mismo remitente ya asociados (solo si corroboran dominio)
 * 4) dominio de contactos / website (media)
 *
 * Nunca sugiere la cuenta de la propia empresa del tenant. Si el remitente
 * tiene dominio corporativo, los "hilos previos" solo cuentan cuando la cuenta
 * está ligada a ese dominio (contactos @dominio o website).
 */
export async function suggestAccountsForThread(
  tenantId: string,
  threadId: string,
): Promise<AccountSuggestion[]> {
  const [msgs, own] = await Promise.all([
    prisma.crmEmailMessage.findMany({
      where: { tenantId, threadId, direction: "in", isDraft: false },
      select: { fromEmail: true, textBody: true, htmlBody: true, subject: true },
      take: 20,
    }),
    loadOwnTenant(tenantId),
  ]);

  const out = new Map<string, AccountSuggestion>();

  const put = (s: AccountSuggestion, accountMeta?: { name: string; website?: string | null }) => {
    if (accountMeta && isOwnCompanyAccount(accountMeta, own)) return;
    if (isOwnCompanyAccount({ name: s.name }, own)) return;
    if (!out.has(s.id)) out.set(s.id, s);
  };

  // 1) Match exacto de email → confianza alta
  const exactEmails = new Set<string>();
  for (const m of msgs) {
    for (const e of extractEmailAddresses(m.fromEmail)) {
      const norm = normalizeEmailAddress(e);
      // Ignorar remitentes del propio tenant (mislabel SENT → in, etc.).
      const d = domainOf(norm);
      if (d && own.domains.has(d)) continue;
      exactEmails.add(norm);
    }
  }
  if (exactEmails.size > 0) {
    const contacts = await prisma.crmContact.findMany({
      where: {
        tenantId,
        OR: Array.from(exactEmails).map((e) => ({
          email: { equals: e, mode: "insensitive" as const },
        })),
      },
      select: {
        accountId: true,
        account: { select: { id: true, name: true, website: true } },
      },
      take: 10,
    });
    for (const c of contacts) {
      if (!c.account) continue;
      put(
        {
          id: c.account.id,
          name: c.account.name,
          reason: "Email exacto del contacto",
          confidence: "alta",
        },
        c.account,
      );
    }
  }

  // 2) RUT en cuerpo
  const haystack = msgs
    .map((m) => `${m.subject ?? ""}\n${m.textBody ?? ""}\n${(m.htmlBody ?? "").replace(/<[^>]+>/g, " ")}`)
    .join("\n");
  const rutMatch = haystack.match(RUT_RE);
  if (rutMatch && out.size < 3) {
    const rut = rutMatch[1].replace(/\./g, "").toLowerCase();
    const byRut = await prisma.crmAccount.findMany({
      where: {
        tenantId,
        rut: { contains: rut.replace(/-/g, "").slice(0, 8), mode: "insensitive" },
      },
      select: { id: true, name: true, rut: true, website: true },
      take: 3,
    });
    for (const a of byRut) {
      put(
        {
          id: a.id,
          name: a.name,
          reason: "RUT citado en el correo",
          confidence: "alta",
        },
        a,
      );
    }
  }

  // Dominios corporativos del remitente (para corroborar hilos previos + paso 4)
  const senderDomains = Array.from(
    new Set(
      Array.from(exactEmails)
        .map((e) => domainOf(e))
        .filter((d): d is string => Boolean(d) && !own.domains.has(d!)),
    ),
  );

  // 3) Hilos previos del mismo remitente ya asociados
  if (out.size < 3 && exactEmails.size > 0) {
    const prior = await prisma.crmEmailThread.findMany({
      where: {
        tenantId,
        accountId: { not: null },
        id: { not: threadId },
        messages: {
          some: {
            direction: "in",
            OR: Array.from(exactEmails).map((e) => ({
              fromEmail: { contains: e, mode: "insensitive" as const },
            })),
          },
        },
      },
      select: {
        id: true,
        accountId: true,
        messages: {
          where: { direction: "in", isDraft: false },
          select: { fromEmail: true },
          take: 10,
        },
      },
      take: 15,
    });

    // Post-filtro: contains en SQL es aproximado (`"Nombre" <email>`); exigir email exacto.
    const corroborated = prior.filter((p) =>
      p.messages.some((m) => messageHasExactFrom(m.fromEmail, exactEmails)),
    );

    const accountToThreads = new Map<string, string[]>();
    for (const p of corroborated) {
      if (!p.accountId) continue;
      const list = accountToThreads.get(p.accountId) ?? [];
      list.push(p.id);
      accountToThreads.set(p.accountId, list);
    }

    if (accountToThreads.size > 0) {
      const accounts = await prisma.crmAccount.findMany({
        where: { tenantId, id: { in: Array.from(accountToThreads.keys()) } },
        select: { id: true, name: true, website: true },
      });

      // Si hay dominio corporativo del remitente, solo sugerir cuentas ligadas a él.
      let domainLinkedIds: Set<string> | null = null;
      if (senderDomains.length > 0) {
        const [byContact, byWeb] = await Promise.all([
          prisma.crmContact.findMany({
            where: {
              tenantId,
              accountId: { in: accounts.map((a) => a.id) },
              OR: senderDomains.map((d) => ({
                email: { endsWith: `@${d}`, mode: "insensitive" as const },
              })),
            },
            select: { accountId: true },
            take: 50,
          }),
          Promise.resolve(
            accounts.filter((a) => {
              const w = websiteDomain(a.website);
              return Boolean(w && senderDomains.some((d) => w === d || w.endsWith(`.${d}`)));
            }),
          ),
        ]);
        domainLinkedIds = new Set<string>();
        for (const c of byContact) {
          if (c.accountId) domainLinkedIds.add(c.accountId);
        }
        for (const a of byWeb) domainLinkedIds.add(a.id);
      }

      for (const a of accounts) {
        if (domainLinkedIds && !domainLinkedIds.has(a.id)) continue;
        put(
          {
            id: a.id,
            name: a.name,
            reason: "Hilos previos del mismo remitente",
            confidence: "media",
            evidenceThreadIds: accountToThreads.get(a.id)?.slice(0, 5),
          },
          a,
        );
      }
    }
  }

  // 4) Dominio (media) — varios contactos mismo dominio = media, nunca alta
  if (senderDomains.length > 0 && out.size < 3) {
    const contacts = await prisma.crmContact.findMany({
      where: {
        tenantId,
        OR: senderDomains.map((d) => ({
          email: { endsWith: `@${d}`, mode: "insensitive" as const },
        })),
      },
      select: { accountId: true },
      take: 30,
    });
    const contactAccountIds = Array.from(
      new Set(contacts.map((c) => c.accountId).filter((id): id is string => Boolean(id))),
    );
    if (contactAccountIds.length > 0) {
      const accounts = await prisma.crmAccount.findMany({
        where: { tenantId, id: { in: contactAccountIds } },
        select: { id: true, name: true, website: true },
      });
      for (const a of accounts) {
        put(
          {
            id: a.id,
            name: a.name,
            reason: "Mismo dominio de correo",
            confidence: "media",
          },
          a,
        );
      }
    }
    if (out.size < 3) {
      const byWeb = await prisma.crmAccount.findMany({
        where: {
          tenantId,
          OR: senderDomains.map((d) => ({ website: { contains: d, mode: "insensitive" as const } })),
        },
        select: { id: true, name: true, website: true },
        take: 5,
      });
      for (const a of byWeb) {
        put(
          {
            id: a.id,
            name: a.name,
            reason: "Dominio del sitio web",
            confidence: "media",
          },
          a,
        );
      }
    }
  }

  // Orden: alta primero
  return Array.from(out.values())
    .sort((a, b) => (a.confidence === b.confidence ? 0 : a.confidence === "alta" ? -1 : 1))
    .slice(0, 3);
}
