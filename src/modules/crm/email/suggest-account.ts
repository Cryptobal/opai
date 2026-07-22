import { prisma } from "@/lib/prisma";

export type AccountSuggestion = { id: string; name: string; reason: string };

/** Dominios de correo personales: no identifican una cuenta. */
const GENERIC_DOMAINS = new Set([
  "gmail.com", "hotmail.com", "outlook.com", "yahoo.com", "yahoo.es",
  "live.com", "icloud.com", "me.com", "proton.me", "gmx.com",
]);

function domainOf(email: string | null | undefined): string | null {
  const at = (email ?? "").lastIndexOf("@");
  if (at < 0) return null;
  const d = email!.slice(at + 1).trim().toLowerCase();
  return d && !GENERIC_DOMAINS.has(d) ? d : null;
}

/**
 * Sugiere cuentas para asociar un hilo, infiriendo por el dominio del remitente
 * entrante: (1) cuentas cuyos contactos comparten ese dominio, (2) cuentas cuyo
 * sitio web contiene el dominio. Heurística barata y confiable (mejor que
 * adivinar por nombre); el usuario confirma con un toque o busca a mano.
 */
export async function suggestAccountsForThread(
  tenantId: string,
  threadId: string,
): Promise<AccountSuggestion[]> {
  const msgs = await prisma.crmEmailMessage.findMany({
    where: { tenantId, threadId, direction: "in" },
    select: { fromEmail: true },
    take: 20,
  });
  const domains = Array.from(
    new Set(msgs.map((m) => domainOf(m.fromEmail)).filter((d): d is string => Boolean(d))),
  );
  if (domains.length === 0) return [];

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

  const out = new Map<string, AccountSuggestion>();
  if (contactAccountIds.length > 0) {
    const accounts = await prisma.crmAccount.findMany({
      where: { tenantId, id: { in: contactAccountIds } },
      select: { id: true, name: true },
    });
    for (const a of accounts) {
      out.set(a.id, { id: a.id, name: a.name, reason: "Mismo dominio de correo" });
    }
  }

  if (out.size < 3) {
    const byWeb = await prisma.crmAccount.findMany({
      where: { tenantId, OR: domains.map((d) => ({ website: { contains: d, mode: "insensitive" as const } })) },
      select: { id: true, name: true },
      take: 5,
    });
    for (const a of byWeb) {
      if (!out.has(a.id)) out.set(a.id, { id: a.id, name: a.name, reason: "Dominio del sitio web" });
    }
  }

  return Array.from(out.values()).slice(0, 3);
}
