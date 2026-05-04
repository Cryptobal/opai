/**
 * Helpers internos para la propagación Deal ↔ Quote ↔ Installation.
 * Ver `deal-propagation.ts` para el contrato público.
 */

import type { Prisma, PrismaClient } from "@prisma/client";

export type Tx = Prisma.TransactionClient | PrismaClient;

/**
 * Selecciona la "quote ganadora" de un deal:
 * 1. Si deal.activeQuotationId apunta a una quote ligada → esa.
 * 2. Si hay una quote en 'approved' ligada → esa.
 * 3. Si hay una sola quote en 'sent' → esa.
 * 4. Si hay varias en 'sent' → la más reciente por updatedAt.
 * 5. Si no hay candidata → null.
 */
export async function pickWinningQuote(
  tx: Tx,
  tenantId: string,
  dealId: string
): Promise<{ id: string; status: string; installationId: string | null } | null> {
  const deal = await tx.crmDeal.findFirst({
    where: { id: dealId, tenantId },
    select: { activeQuotationId: true },
  });

  const directQuotes = await tx.cpqQuote.findMany({
    where: { tenantId, dealId },
    select: { id: true, status: true, installationId: true, updatedAt: true },
  });
  const linkedRows = await tx.crmDealQuote.findMany({
    where: { tenantId, dealId },
    select: { quoteId: true },
  });
  const linkedIds = linkedRows.map((r) => r.quoteId);
  const linkedQuotes = linkedIds.length
    ? await tx.cpqQuote.findMany({
        where: { tenantId, id: { in: linkedIds } },
        select: { id: true, status: true, installationId: true, updatedAt: true },
      })
    : [];

  const allQuotes = [
    ...directQuotes,
    ...linkedQuotes.filter((q) => !directQuotes.some((d) => d.id === q.id)),
  ];

  if (deal?.activeQuotationId) {
    const active = allQuotes.find((q) => q.id === deal.activeQuotationId);
    if (active) return active;
  }

  const approved = allQuotes.find((q) => q.status === "approved");
  if (approved) return approved;

  const sentQuotes = allQuotes.filter((q) => q.status === "sent");
  if (sentQuotes.length === 1) return sentQuotes[0];
  if (sentQuotes.length > 1) {
    return sentQuotes.sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
    )[0];
  }

  return null;
}

/** Verifica si una instalación tiene operación real registrada. */
export async function hasOperationalActivity(
  tx: Tx,
  tenantId: string,
  installationId: string
): Promise<boolean> {
  const [pautas, asistencias, marcaciones] = await Promise.all([
    tx.opsPautaMensual.count({ where: { tenantId, installationId } }),
    tx.opsAsistenciaDiaria.count({ where: { tenantId, installationId } }),
    tx.opsMarcacion.count({ where: { tenantId, installationId } }),
  ]);
  return pautas > 0 || asistencias > 0 || marcaciones > 0;
}

/** Verifica si otro deal won del tenant tiene quote approved apuntando a esta instalación. */
export async function hasOtherWonDealUsingInstallation(
  tx: Tx,
  tenantId: string,
  installationId: string,
  excludeDealId: string
): Promise<boolean> {
  const otherQuotes = await tx.cpqQuote.findMany({
    where: {
      tenantId,
      installationId,
      status: "approved",
      dealId: { not: excludeDealId },
    },
    select: { dealId: true },
  });
  const otherDealIds = otherQuotes
    .map((q) => q.dealId)
    .filter((id): id is string => Boolean(id));
  if (otherDealIds.length === 0) return false;

  const wonCount = await tx.crmDeal.count({
    where: { tenantId, id: { in: otherDealIds }, status: "won" },
  });
  return wonCount > 0;
}

/** Junta IDs de quotes hermanas (directas + via pivot) excluyendo la ganadora. */
export async function collectSiblingQuoteIds(
  tx: Tx,
  tenantId: string,
  dealId: string,
  winningQuoteId: string
): Promise<string[]> {
  const directSiblings = await tx.cpqQuote.findMany({
    where: {
      tenantId,
      dealId,
      id: { not: winningQuoteId },
      status: { in: ["draft", "sent"] },
    },
    select: { id: true },
  });
  const linkedRows = await tx.crmDealQuote.findMany({
    where: { tenantId, dealId, quoteId: { not: winningQuoteId } },
    select: { quoteId: true },
  });
  return [
    ...directSiblings.map((q) => q.id),
    ...linkedRows.map((r) => r.quoteId),
  ].filter((id, i, arr) => arr.indexOf(id) === i);
}

/** Junta IDs de quotes abiertas (draft, sent) directas + via pivot. */
export async function collectOpenQuoteIds(
  tx: Tx,
  tenantId: string,
  dealId: string
): Promise<string[]> {
  const directOpen = await tx.cpqQuote.findMany({
    where: { tenantId, dealId, status: { in: ["draft", "sent"] } },
    select: { id: true },
  });
  const linkedRows = await tx.crmDealQuote.findMany({
    where: { tenantId, dealId },
    select: { quoteId: true },
  });
  const linkedOpen = linkedRows.length
    ? await tx.cpqQuote.findMany({
        where: {
          tenantId,
          id: { in: linkedRows.map((r) => r.quoteId) },
          status: { in: ["draft", "sent"] },
        },
        select: { id: true },
      })
    : [];
  return [
    ...directOpen.map((q) => q.id),
    ...linkedOpen.map((q) => q.id),
  ].filter((id, i, arr) => arr.indexOf(id) === i);
}
