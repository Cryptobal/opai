import { prisma } from "@/lib/prisma";
import { extractEmailAddresses, normalizeEmailAddress } from "@/lib/email-address";

export type AccountSuggestion = {
  id: string;
  name: string;
  reason: string;
  confidence: "alta" | "media";
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

/**
 * Sugiere cuentas para asociar un hilo (Copiloto v4):
 * 1) email exacto de contacto (alta)
 * 2) RUT en cuerpo/adjunto
 * 3) hilos previos del mismo remitente ya asociados
 * 4) dominio de contactos / website (media)
 */
export async function suggestAccountsForThread(
  tenantId: string,
  threadId: string,
): Promise<AccountSuggestion[]> {
  const msgs = await prisma.crmEmailMessage.findMany({
    where: { tenantId, threadId, direction: "in", isDraft: false },
    select: { fromEmail: true, textBody: true, htmlBody: true, subject: true },
    take: 20,
  });

  const out = new Map<string, AccountSuggestion>();

  // 1) Match exacto de email → confianza alta
  const exactEmails = new Set<string>();
  for (const m of msgs) {
    for (const e of extractEmailAddresses(m.fromEmail)) {
      exactEmails.add(normalizeEmailAddress(e));
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
        account: { select: { id: true, name: true } },
      },
      take: 10,
    });
    for (const c of contacts) {
      if (!c.account) continue;
      out.set(c.account.id, {
        id: c.account.id,
        name: c.account.name,
        reason: "Email exacto del contacto",
        confidence: "alta",
      });
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
      select: { id: true, name: true, rut: true },
      take: 3,
    });
    for (const a of byRut) {
      if (!out.has(a.id)) {
        out.set(a.id, {
          id: a.id,
          name: a.name,
          reason: "RUT citado en el correo",
          confidence: "alta",
        });
      }
    }
  }

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
      select: { accountId: true },
      take: 5,
    });
    const accountIds = Array.from(
      new Set(prior.map((p) => p.accountId).filter(Boolean) as string[]),
    );
    if (accountIds.length > 0) {
      const accounts = await prisma.crmAccount.findMany({
        where: { tenantId, id: { in: accountIds } },
        select: { id: true, name: true },
      });
      for (const a of accounts) {
        if (!out.has(a.id)) {
          out.set(a.id, {
            id: a.id,
            name: a.name,
            reason: "Hilos previos del mismo remitente",
            confidence: "media",
          });
        }
      }
    }
  }

  // 4) Dominio (media) — varios contactos mismo dominio = media, nunca alta
  const domains = Array.from(
    new Set(msgs.map((m) => domainOf(m.fromEmail)).filter((d): d is string => Boolean(d))),
  );
  if (domains.length > 0 && out.size < 3) {
    const contacts = await prisma.crmContact.findMany({
      where: {
        tenantId,
        OR: domains.map((d) => ({ email: { endsWith: `@${d}`, mode: "insensitive" as const } })),
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
        select: { id: true, name: true },
      });
      const multiDomain = contactAccountIds.length > 1;
      for (const a of accounts) {
        if (!out.has(a.id)) {
          out.set(a.id, {
            id: a.id,
            name: a.name,
            reason: "Mismo dominio de correo",
            confidence: multiDomain ? "media" : "media",
          });
        }
      }
    }
    if (out.size < 3) {
      const byWeb = await prisma.crmAccount.findMany({
        where: {
          tenantId,
          OR: domains.map((d) => ({ website: { contains: d, mode: "insensitive" as const } })),
        },
        select: { id: true, name: true },
        take: 5,
      });
      for (const a of byWeb) {
        if (!out.has(a.id)) {
          out.set(a.id, {
            id: a.id,
            name: a.name,
            reason: "Dominio del sitio web",
            confidence: "media",
          });
        }
      }
    }
  }

  // Orden: alta primero
  return Array.from(out.values())
    .sort((a, b) => (a.confidence === b.confidence ? 0 : a.confidence === "alta" ? -1 : 1))
    .slice(0, 3);
}
