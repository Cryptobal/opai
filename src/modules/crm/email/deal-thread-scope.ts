import { prisma } from "@/lib/prisma";

export type DealEmailScope = { accountId: string | null; contactIds: string[] };

/** Cuenta + contactos del deal (primaryContact + CrmDealContact). */
export async function getDealEmailScope(
  tenantId: string,
  dealId: string,
): Promise<DealEmailScope | null> {
  const deal = await prisma.crmDeal.findFirst({
    where: { id: dealId, tenantId },
    select: { accountId: true, primaryContactId: true },
  });
  if (!deal) return null;
  const dealContacts = await prisma.crmDealContact.findMany({
    where: { dealId, tenantId },
    select: { contactId: true },
  });
  const contactIds = Array.from(
    new Set(
      [deal.primaryContactId, ...dealContacts.map((d) => d.contactId)].filter(
        Boolean,
      ) as string[],
    ),
  );
  return { accountId: deal.accountId, contactIds };
}

/**
 * WHERE (criterio ampliado) para CrmEmailThread de un deal:
 *   dealId = deal.id
 *   OR (accountId = deal.accountId AND (contactId ∈ contactos del deal OR contactId IS NULL))
 * Así la IA ve correos de la cuenta aunque el thread no esté atado al deal.
 */
export function buildDealThreadWhere(
  tenantId: string,
  dealId: string,
  scope: DealEmailScope,
): Record<string, unknown> {
  const or: Record<string, unknown>[] = [{ dealId }];
  if (scope.accountId) {
    or.push({
      accountId: scope.accountId,
      OR: [
        ...(scope.contactIds.length ? [{ contactId: { in: scope.contactIds } }] : []),
        { contactId: null },
      ],
    });
  }
  return { tenantId, OR: or };
}
