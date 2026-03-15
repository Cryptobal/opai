import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { parsePortalClienteSessionCookie } from "@/lib/portal-cliente";
import { getUfValue } from "@/lib/uf";
import { clpToUf } from "@/lib/uf-utils";
import { computeCpqQuoteCosts } from "@/modules/cpq/costing/compute-quote-costs";

export async function GET() {
  const cookieStore = await cookies();
  const session = parsePortalClienteSessionCookie(
    cookieStore.get("portal_cliente_session")?.value
  );
  if (!session) return NextResponse.json({ error: "No session" }, { status: 401 });

  const quotes = await prisma.cpqQuote.findMany({
    where: { accountId: session.accountId, tenantId: session.tenantId, status: { not: "draft" } },
    include: {
      positions: { select: { id: true, numGuards: true } },
      parameters: { select: { salePriceMonthly: true, marginPct: true } },
      additionalLines: { select: { precio: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Fetch deal titles for quotes that have a dealId
  const dealIds = [...new Set(quotes.map((q) => q.dealId).filter(Boolean))] as string[];
  const deals = dealIds.length
    ? await prisma.crmDeal.findMany({
        where: { id: { in: dealIds } },
        select: { id: true, title: true, proposalLink: true },
      })
    : [];
  const dealMap = new Map(deals.map((d) => [d.id, d]));

  const needsUf = quotes.some((q) => (q.currency || "CLP") === "UF");
  const ufValue = needsUf ? await getUfValue() : 0;

  const quoteIds = quotes.map((q) => q.id);
  let presentationMap = new Map<string, string>();
  try {
    const presentations = await prisma.presentation.findMany({
      where: { quoteId: { in: quoteIds }, status: { not: "draft" } },
      select: { quoteId: true, uniqueId: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://opai.gard.cl";
    for (const p of presentations) {
      if (p.quoteId && !presentationMap.has(p.quoteId)) {
        presentationMap.set(p.quoteId, `${siteUrl}/p/${p.uniqueId}`);
      }
    }
  } catch {}

  // Para cotizaciones sin salePriceMonthly guardado, computar desde costos
  const computedSalePrices = new Map<string, number>();
  const toCompute = quotes.filter((q) => {
    const sp = q.parameters?.salePriceMonthly != null ? Number(q.parameters.salePriceMonthly) : 0;
    return sp <= 0;
  });
  await Promise.all(
    toCompute.map(async (q) => {
      try {
        const costSummary = await computeCpqQuoteCosts(q.id);
        const marginPct = Number(q.parameters?.marginPct ?? 13) / 100;
        const costsBase =
          costSummary.monthlyPositions +
          (costSummary.monthlyHolidayAdjustment ?? 0) +
          (costSummary.monthlyUniforms ?? 0) +
          (costSummary.monthlyExams ?? 0) +
          (costSummary.monthlyMeals ?? 0) +
          (costSummary.monthlyVehicles ?? 0) +
          (costSummary.monthlyInfrastructure ?? 0) +
          (costSummary.monthlyCostItems ?? 0);
        const bwm = marginPct < 1 ? costsBase / (1 - marginPct) : costsBase;
        const salePrice = bwm + (costSummary.monthlyFinancial ?? 0) + (costSummary.monthlyPolicy ?? 0);
        computedSalePrices.set(q.id, salePrice);
      } catch {
        // ignorar
      }
    })
  );

  const data = quotes.map((q) => {
    const deal = q.dealId ? dealMap.get(q.dealId) : null;
    const salePriceClp =
      (q.parameters?.salePriceMonthly != null ? Number(q.parameters.salePriceMonthly) : 0) ||
      computedSalePrices.get(q.id) ||
      0;
    const additionalLinesTotal =
      q.additionalLines?.reduce((s, l) => s + Number(l.precio || 0), 0) ?? 0;
    const rawCost = (salePriceClp > 0 ? salePriceClp : (q.monthlyCost?.toNumber() ?? 0)) + additionalLinesTotal;
    const currency = (q.currency || "CLP") as string;
    const monthlyCost = currency === "UF" && ufValue > 0 ? clpToUf(rawCost, ufValue) : rawCost;

    return {
      id: q.id,
      code: q.code,
      name: q.clientName,
      status: q.status,
      monthlyCost,
      validUntil: q.validUntil,
      totalPositions: q.positions.length,
      totalGuards: q.positions.reduce((s, p) => s + (p.numGuards ?? 0), 0),
      currency,
      createdAt: q.createdAt,
      dealId: q.dealId ?? null,
      dealTitle: deal?.title ?? null,
      proposalLink: presentationMap.get(q.id) ?? deal?.proposalLink ?? null,
    };
  });

  return NextResponse.json({ success: true, data });
}
