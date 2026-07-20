import { prisma } from "@/lib/prisma";

export type ThreadLinks = {
  contactId: string | null;
  accountId: string | null;
  dealId: string | null;
};

/**
 * Resuelve contacto / cuenta / deal a partir de las direcciones de correo de la
 * contraparte. Heurística conservadora:
 *  - contacto = primer CrmContact del tenant cuyo email coincida.
 *  - cuenta = accountId de ese contacto.
 *  - deal = solo si la cuenta tiene EXACTAMENTE un CrmDeal abierto.
 */
export async function resolveThreadLinks(
  tenantId: string,
  emails: string[],
): Promise<ThreadLinks> {
  const empty: ThreadLinks = { contactId: null, accountId: null, dealId: null };
  const candidates = Array.from(
    new Set(emails.map((e) => e?.trim().toLowerCase()).filter(Boolean) as string[]),
  );
  if (candidates.length === 0) return empty;

  const contact = await prisma.crmContact.findFirst({
    where: {
      tenantId,
      OR: candidates.map((e) => ({ email: { equals: e, mode: "insensitive" as const } })),
    },
    select: { id: true, accountId: true },
  });
  if (!contact) return empty;

  let dealId: string | null = null;
  if (contact.accountId) {
    const openDeals = await prisma.crmDeal.findMany({
      where: { tenantId, accountId: contact.accountId, status: "open" },
      select: { id: true },
      take: 2,
    });
    if (openDeals.length === 1) dealId = openDeals[0].id;
  }
  return { contactId: contact.id, accountId: contact.accountId ?? null, dealId };
}

/**
 * Busca (por subject) o crea el thread y, al hacerlo, vincula contacto/cuenta/deal.
 * En threads existentes hace backfill SOLO de los FKs que estén null — nunca
 * sobreescribe un dealId (u otro vínculo) ya seteado.
 */
export async function upsertLinkedThread(params: {
  tenantId: string;
  subject: string;
  lastMessageAt: Date;
  counterpartyEmails: string[];
}): Promise<{ id: string }> {
  const { tenantId, subject, lastMessageAt } = params;
  const links = await resolveThreadLinks(tenantId, params.counterpartyEmails);

  const existing = await prisma.crmEmailThread.findFirst({
    where: { tenantId, subject },
    select: { id: true, contactId: true, accountId: true, dealId: true },
  });

  if (!existing) {
    return prisma.crmEmailThread.create({
      data: {
        tenantId,
        subject,
        lastMessageAt,
        contactId: links.contactId,
        accountId: links.accountId,
        dealId: links.dealId,
      },
      select: { id: true },
    });
  }

  await prisma.crmEmailThread.update({
    where: { id: existing.id },
    data: {
      lastMessageAt,
      ...(existing.contactId == null && links.contactId ? { contactId: links.contactId } : {}),
      ...(existing.accountId == null && links.accountId ? { accountId: links.accountId } : {}),
      ...(existing.dealId == null && links.dealId ? { dealId: links.dealId } : {}),
    },
  });
  return { id: existing.id };
}
