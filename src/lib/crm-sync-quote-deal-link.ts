import type { Prisma } from "@prisma/client";

/**
 * Mantiene alineada la tabla puente crm.deal_quotes con cpq.quotes.deal_id.
 * Una cotización debe tener como mucho un vínculo por tenant (se eliminan filas previas para este quoteId).
 */
export async function syncCrmDealQuoteLink(
  tx: Prisma.TransactionClient,
  args: { tenantId: string; quoteId: string; dealId: string | null }
): Promise<void> {
  const { tenantId, quoteId, dealId } = args;
  await tx.crmDealQuote.deleteMany({ where: { tenantId, quoteId } });
  if (dealId) {
    await tx.crmDealQuote.create({
      data: { tenantId, dealId, quoteId },
    });
  }
}
