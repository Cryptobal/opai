import { prisma } from "@/lib/prisma";
import { normalizeEmailAddress } from "@/lib/email-address";

export type BriefMatch = { accountId: string; contactIds: string[] };

type Attendee = { email?: string | null; self?: boolean | null };

/**
 * Matchea los asistentes externos de un evento a una cuenta CRM: primero por
 * email de contacto, luego por dominio → website de la cuenta. null si ninguno
 * matchea (evento sin cuenta CRM → sin brief).
 */
export async function matchEventToCrm(
  tenantId: string,
  ownEmail: string,
  attendees: Attendee[],
): Promise<BriefMatch | null> {
  const own = normalizeEmailAddress(ownEmail);
  const emails = Array.from(
    new Set(
      attendees
        .filter((a) => a.email && !a.self)
        .map((a) => normalizeEmailAddress(a.email as string))
        .filter((e) => e && e !== own),
    ),
  );
  if (!emails.length) return null;

  // 1. Match por email de contacto CRM.
  const contacts = await prisma.crmContact.findMany({
    where: { tenantId, email: { in: emails } },
    select: { id: true, accountId: true },
  });
  if (contacts.length) {
    const accountId = contacts[0].accountId;
    const contactIds = contacts.filter((c) => c.accountId === accountId).map((c) => c.id);
    return { accountId, contactIds };
  }

  // 2. Fallback: dominio del email → website de la cuenta.
  const domains = Array.from(new Set(emails.map((e) => e.split("@")[1]).filter(Boolean)));
  for (const domain of domains) {
    const acc = await prisma.crmAccount.findFirst({
      where: { tenantId, website: { contains: domain, mode: "insensitive" } },
      select: { id: true },
    });
    if (acc) return { accountId: acc.id, contactIds: [] };
  }
  return null;
}
