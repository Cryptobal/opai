/**
 * Resolución de entidades para el buscador/asistente de correos.
 * Usa CRM (contactos/cuentas) + frecency (`email_recipients`) + participantes
 * históricos de la casilla.
 */
import { prisma } from "@/lib/prisma";
import { normalizeEmailAddress } from "@/lib/email-address";

export type ResolvedEntity = {
  kind: "person" | "company" | "domain" | "email";
  label: string;
  email?: string | null;
  domain?: string | null;
  contactId?: string | null;
  accountId?: string | null;
  accountName?: string | null;
  score: number;
};

function domainOf(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  return email.slice(at + 1).toLowerCase() || null;
}

function rootDomainLabel(domain: string): string {
  const parts = domain.split(".");
  if (parts.length <= 2) return parts[0] ?? domain;
  // macronet.cl → macronet; mail.macronet.cl → macronet
  return parts[parts.length - 2] ?? domain;
}

/**
 * Resuelve texto libre ("Luis González", "Macronet", "lgonzalez@…") a
 * candidatos accionables para armar filtros `to:` / `domain:` / `from:`.
 */
export async function resolveEntity(params: {
  tenantId: string;
  userId: string;
  text: string;
  emailAccountId?: string | null;
  limit?: number;
}): Promise<ResolvedEntity[]> {
  const q = params.text.trim().slice(0, 120);
  if (!q) return [];
  const limit = Math.min(Math.max(params.limit ?? 8, 1), 20);
  const qLower = q.toLowerCase();
  const results: ResolvedEntity[] = [];

  // Email literal.
  if (q.includes("@") && q.includes(".")) {
    const email = normalizeEmailAddress(q);
    if (email) {
      results.push({
        kind: "email",
        label: email,
        email,
        domain: domainOf(email),
        score: 100,
      });
    }
  }

  const [contacts, accounts, recipients] = await Promise.all([
    prisma.crmContact.findMany({
      where: {
        tenantId: params.tenantId,
        OR: [
          { email: { contains: q, mode: "insensitive" } },
          { firstName: { contains: q, mode: "insensitive" } },
          { lastName: { contains: q, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        accountId: true,
        account: { select: { id: true, name: true } },
      },
      take: limit,
    }),
    prisma.crmAccount.findMany({
      where: {
        tenantId: params.tenantId,
        name: { contains: q, mode: "insensitive" },
      },
      select: { id: true, name: true, website: true },
      take: limit,
    }),
    prisma.crmEmailRecipient.findMany({
      where: {
        tenantId: params.tenantId,
        userId: params.userId,
        OR: [
          { email: { contains: q, mode: "insensitive" } },
          { displayName: { contains: q, mode: "insensitive" } },
        ],
      },
      select: {
        email: true,
        displayName: true,
        sendCount: true,
        contactId: true,
      },
      orderBy: [{ sendCount: "desc" }, { lastSentAt: "desc" }],
      take: limit,
    }),
  ]);

  for (const c of contacts) {
    const name = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
    const email = c.email ? normalizeEmailAddress(c.email) : null;
    results.push({
      kind: "person",
      label: name || email || q,
      email,
      domain: email ? domainOf(email) : null,
      contactId: c.id,
      accountId: c.accountId,
      accountName: c.account?.name ?? null,
      score: 80 + (email?.includes(qLower) ? 10 : 0),
    });
  }

  for (const a of accounts) {
    let domain: string | null = null;
    if (a.website) {
      try {
        const host = new URL(
          a.website.startsWith("http") ? a.website : `https://${a.website}`,
        ).hostname.replace(/^www\./, "");
        domain = host || null;
      } catch {
        domain = null;
      }
    }
    // Si el nombre matchea un dominio raíz visto en recipients, úsalo.
    if (!domain) {
      const hint = recipients.find((r) => {
        const d = domainOf(r.email);
        return d && rootDomainLabel(d) === qLower;
      });
      if (hint) domain = domainOf(hint.email);
    }
    results.push({
      kind: "company",
      label: a.name,
      domain,
      accountId: a.id,
      accountName: a.name,
      score: 70,
    });
  }

  for (const r of recipients) {
    const email = normalizeEmailAddress(r.email);
    if (!email) continue;
    if (results.some((x) => x.email === email)) continue;
    results.push({
      kind: "person",
      label: r.displayName?.trim() || email,
      email,
      domain: domainOf(email),
      contactId: r.contactId,
      score: 50 + Math.min(r.sendCount, 20),
    });
  }

  // Dominio suelto: "macronet" → macronet.cl si aparece en la casilla.
  if (!q.includes("@") && params.emailAccountId) {
    const domainRows = await prisma.$queryRaw<Array<{ domain: string; n: bigint }>>`
      SELECT split_part(LOWER(p.email), '@', 2) AS domain, COUNT(*)::bigint AS n
      FROM crm.email_messages m
      CROSS JOIN LATERAL unnest(ARRAY[m.from_email] || m.to_emails || m.cc_emails) AS p(email)
      WHERE m.tenant_id = ${params.tenantId}
        AND m.email_account_id = ${params.emailAccountId}::uuid
        AND (
          split_part(LOWER(p.email), '@', 2) = ${qLower}
          OR split_part(LOWER(p.email), '@', 2) LIKE ${`%.${qLower}`}
          OR split_part(LOWER(p.email), '@', 2) LIKE ${`${qLower}.%`}
        )
      GROUP BY 1
      ORDER BY n DESC
      LIMIT 5
    `;
    for (const row of domainRows) {
      if (!row.domain) continue;
      if (results.some((x) => x.domain === row.domain)) continue;
      results.push({
        kind: "domain",
        label: row.domain,
        domain: row.domain,
        score: 60 + Number(row.n),
      });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

/**
 * Expande una consulta en lenguaje natural a operadores Gmail-like.
 * Ej.: "ACUDA a Luis González Macronet" → `ACUDA to:lgonzalez@… OR domain:macronet.cl in:all`
 */
export function buildExpandedSearchQuery(params: {
  freeText: string[];
  entities: ResolvedEntity[];
  folder?: string;
}): string {
  const parts: string[] = [];
  for (const t of params.freeText) {
    if (t.trim()) parts.push(t.trim());
  }
  const emails = params.entities
    .map((e) => e.email)
    .filter((e): e is string => Boolean(e));
  const domains = params.entities
    .map((e) => e.domain)
    .filter((d): d is string => Boolean(d));

  const uniqueEmails = Array.from(new Set(emails)).slice(0, 3);
  const uniqueDomains = Array.from(new Set(domains)).slice(0, 3);

  for (const email of uniqueEmails) parts.push(`to:${email}`);
  for (const domain of uniqueDomains) {
    if (!uniqueEmails.some((e) => e.endsWith(`@${domain}`))) {
      parts.push(`domain:${domain}`);
    }
  }
  parts.push(`in:${params.folder ?? "all"}`);
  return parts.join(" ").trim();
}
