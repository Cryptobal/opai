/**
 * Resolución de entidades para el asistente de correos.
 * Persona / empresa / dominio → direcciones y dominios buscables.
 */
import { prisma } from "@/lib/prisma";
import { normalizeEmailAddress } from "@/lib/email-address";
import { matchQuality } from "./email-recipients";

export type ResolvedEmailEntity = {
  kind: "person" | "company" | "domain";
  label: string;
  emails: string[];
  domains: string[];
  contactId?: string | null;
  accountId?: string | null;
  score: number;
};

function domainOf(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  return email.slice(at + 1).toLowerCase() || null;
}

function looksLikeDomain(q: string): boolean {
  return /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(q.trim());
}

/**
 * Resuelve texto libre a contactos/empresas/dominios del tenant + frecency.
 */
export async function resolveEmailEntity(params: {
  tenantId: string;
  userId: string;
  text: string;
  limit?: number;
}): Promise<ResolvedEmailEntity[]> {
  const q = params.text.trim();
  if (!q || q.length < 2) return [];
  const limit = Math.min(Math.max(params.limit ?? 8, 1), 20);
  const qLower = q.toLowerCase();

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
      take: 30,
    }),
    prisma.crmAccount.findMany({
      where: {
        tenantId: params.tenantId,
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { website: { contains: q, mode: "insensitive" } },
        ],
      },
      select: { id: true, name: true, website: true },
      take: 20,
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
      orderBy: { sendCount: "desc" },
      take: 30,
    }),
  ]);

  const out: ResolvedEmailEntity[] = [];

  for (const c of contacts) {
    const email = c.email ? normalizeEmailAddress(c.email) : "";
    const name = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
    const quality = matchQuality(qLower, email, name || null);
    if (quality === 0 && !email.includes(qLower) && !name.toLowerCase().includes(qLower)) {
      continue;
    }
    const domain = email ? domainOf(email) : null;
    out.push({
      kind: "person",
      label: name || email,
      emails: email ? [email] : [],
      domains: domain ? [domain] : [],
      contactId: c.id,
      accountId: c.accountId,
      score: quality * 10 + (email ? 2 : 0),
    });
  }

  for (const r of recipients) {
    const email = normalizeEmailAddress(r.email);
    if (!email) continue;
    if (out.some((e) => e.emails.includes(email))) continue;
    const quality = matchQuality(qLower, email, r.displayName);
    if (quality === 0) continue;
    const domain = domainOf(email);
    out.push({
      kind: "person",
      label: r.displayName || email,
      emails: [email],
      domains: domain ? [domain] : [],
      contactId: r.contactId,
      score: quality * 8 + Math.min(r.sendCount, 20) * 0.1,
    });
  }

  for (const a of accounts) {
    const domains: string[] = [];
    if (a.website) {
      try {
        const host = new URL(
          a.website.startsWith("http") ? a.website : `https://${a.website}`,
        ).hostname.replace(/^www\./, "");
        if (host) domains.push(host);
      } catch {
        /* ignore */
      }
    }
    // Dominio implícito desde el nombre (Macronet → buscar recipients @macronet)
    const nameToken = a.name.toLowerCase().replace(/[^a-z0-9]+/g, "");
    out.push({
      kind: "company",
      label: a.name,
      emails: [],
      domains,
      accountId: a.id,
      score:
        (a.name.toLowerCase().includes(qLower) ? 12 : 4) +
        (nameToken.includes(qLower.replace(/[^a-z0-9]+/g, "")) ? 3 : 0),
    });
  }

  if (looksLikeDomain(q) || !q.includes(" ")) {
    const domainHint = qLower.replace(/^@/, "");
    // Agregar dominio crudo si aparece en recipients.
    const domainHits = recipients.filter((r) =>
      r.email.toLowerCase().includes(`@${domainHint}`),
    );
    if (domainHits.length > 0 || looksLikeDomain(q)) {
      const emails = [
        ...new Set(domainHits.map((r) => normalizeEmailAddress(r.email)).filter(Boolean)),
      ];
      const domains = looksLikeDomain(q)
        ? [domainHint]
        : [
            ...new Set(
              emails.map((e) => domainOf(e)).filter((d): d is string => Boolean(d)),
            ),
          ].filter((d) => d.includes(domainHint));
      if (domains.length > 0) {
        out.push({
          kind: "domain",
          label: domains[0],
          emails,
          domains,
          score: 15,
        });
      }
    }
  }

  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}

/**
 * Expande una consulta en lenguaje natural a filtros de búsqueda estructurados
 * a partir de entidades resueltas.
 */
export function buildSearchPlanFromEntities(params: {
  freeText: string[];
  entities: ResolvedEmailEntity[];
}): {
  queryTerms: string[];
  to: string[];
  domain: string[];
  folder: "all";
} {
  const to = new Set<string>();
  const domain = new Set<string>();
  for (const e of params.entities.slice(0, 4)) {
    for (const mail of e.emails.slice(0, 2)) to.add(mail);
    for (const d of e.domains.slice(0, 2)) domain.add(d);
  }
  // Si hay dominio/persona, no exigir el nombre de empresa como AND léxico
  // (puede no aparecer en el cuerpo).
  const usedLabels = new Set(
    params.entities.flatMap((e) => {
      const parts = [
        e.label.toLowerCase(),
        ...e.label.toLowerCase().split(/\s+/).filter(Boolean),
        ...e.domains,
        ...e.domains.map((d) => d.split(".")[0] ?? ""),
        ...e.emails.map((m) => m.split("@")[0] ?? ""),
      ];
      return parts;
    }),
  );
  const queryTerms = params.freeText.filter(
    (t) => !usedLabels.has(t.toLowerCase()) && !t.includes("@"),
  );
  return {
    queryTerms,
    to: [...to],
    domain: [...domain],
    folder: "all",
  };
}
