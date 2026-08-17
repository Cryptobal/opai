/**
 * Recálculo canónico de totales CPQ tras mutaciones MCP/chat.
 * Fuente de verdad: computeCpqQuoteCosts (mismo patrón que PUT /costs).
 */
import { prisma } from "@/lib/prisma";
import { computeCpqQuoteCosts } from "@/modules/cpq/costing/compute-quote-costs";

export async function recomputeQuoteTotals(quoteId: string) {
  const [totalPositions, summary] = await Promise.all([
    prisma.cpqPosition.count({ where: { quoteId } }),
    computeCpqQuoteCosts(quoteId),
  ]);
  await prisma.cpqQuote.update({
    where: { id: quoteId },
    data: {
      totalPositions,
      totalGuards: summary.totalGuards,
      monthlyCost: summary.monthlyTotal,
    },
  });
  return summary;
}
