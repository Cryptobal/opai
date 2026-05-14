import { prisma } from "@/lib/prisma";
import { computeCpqQuoteCosts } from "@/modules/cpq/costing/compute-quote-costs";

/**
 * Persiste margen en parámetros y actualiza monthlyCost desde el costeo.
 * Equivalente al PUT `/api/cpq/quotes/[id]/margin` pero sin chequeo HTTP.
 */
export async function updateCpqQuoteMargin(opts: {
  quoteId: string;
  tenantId?: string | null;
  marginPct: number;
  marginMode?: string | null;
}): Promise<{ monthlyCost: number }> {
  const { quoteId, tenantId } = opts;
  if (tenantId) {
    const owns = await prisma.cpqQuote.findFirst({
      where: { id: quoteId, tenantId },
      select: { id: true },
    });
    if (!owns) throw new Error("QUOTE_NOT_FOUND");
  }

  const marginPct = opts.marginPct;
  const marginMode = opts.marginMode;

  const updateData: Record<string, unknown> = { marginPct };
  if (marginMode) updateData.marginMode = marginMode;

  await prisma.cpqQuoteParameters.upsert({
    where: { quoteId },
    update: updateData,
    create: {
      quoteId,
      monthlyHoursStandard: 180,
      avgStayMonths: 4,
      uniformChangesPerYear: 3,
      financialRatePct: 2.5,
      salePriceMonthly: 0,
      policyRatePct: 0,
      policyAdminRatePct: 0,
      policyContractMonths: 12,
      policyContractPct: 100,
      contractMonths: 12,
      contractAmount: 0,
      marginPct,
      ...(marginMode ? { marginMode } : {}),
    },
  });

  const summary = await computeCpqQuoteCosts(quoteId);
  const updated = await prisma.cpqQuote.update({
    where: { id: quoteId },
    data: { monthlyCost: summary.monthlyTotal },
    select: { monthlyCost: true },
  });

  return { monthlyCost: Number(updated.monthlyCost) };
}
