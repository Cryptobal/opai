import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { parsePortalClienteSessionCookie } from "@/lib/portal-cliente";
import { getUfValue } from "@/lib/uf";
import { clpToUf } from "@/lib/uf-utils";
import { computeCpqQuoteCosts } from "@/modules/cpq/costing/compute-quote-costs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookieStore = await cookies();
  const session = parsePortalClienteSessionCookie(
    cookieStore.get("portal_cliente_session")?.value
  );
  if (!session) return NextResponse.json({ error: "No session" }, { status: 401 });

  const { id } = await params;

  const quote = await prisma.cpqQuote.findFirst({
    where: { id, accountId: session.accountId, tenantId: session.tenantId },
    include: {
      parameters: { select: { salePriceMonthly: true, marginPct: true, financialRatePct: true, policyRatePct: true, policyContractMonths: true, policyContractPct: true, contractMonths: true } },
      positions: {
        select: {
          id: true,
          customName: true,
          numGuards: true,
          numPuestos: true,
          startTime: true,
          endTime: true,
          weekdays: true,
          monthlyPositionCost: true,
        },
        orderBy: { createdAt: "asc" },
      },
      additionalLines: {
        select: { id: true, nombre: true, descripcion: true, precio: true, orden: true },
        orderBy: { orden: "asc" },
      },
    },
  });

  if (!quote) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const currency = (quote.currency || "CLP") as string;
  const ufValue = currency === "UF" ? await getUfValue() : 0;
  const convertCost = (clp: number) =>
    currency === "UF" && ufValue > 0 ? clpToUf(clp, ufValue) : clp;

  let proposalLink: string | null = null;
  try {
    const presentation = await prisma.presentation.findFirst({
      where: { quoteId: id, status: { not: "draft" } },
      select: { uniqueId: true },
      orderBy: { createdAt: "desc" },
    });
    if (presentation) {
      const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://opai.gard.cl";
      proposalLink = `${siteUrl}/p/${presentation.uniqueId}`;
    }
  } catch {}
  if (!proposalLink && quote.dealId) {
    try {
      const deal = await prisma.crmDeal.findUnique({
        where: { id: quote.dealId },
        select: { proposalLink: true },
      });
      proposalLink = deal?.proposalLink ?? null;
    } catch {}
  }

  // Precio venta mensual neto: salePriceMonthly + líneas adicionales (igual que CPQ)
  let salePriceClp = quote.parameters?.salePriceMonthly != null
    ? Number(quote.parameters.salePriceMonthly)
    : 0;
  if (salePriceClp <= 0) {
    try {
      const costSummary = await computeCpqQuoteCosts(id);
      const marginPct = Number(quote.parameters?.marginPct ?? 13) / 100;
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
      salePriceClp = bwm + (costSummary.monthlyFinancial ?? 0) + (costSummary.monthlyPolicy ?? 0);
    } catch {
      salePriceClp = quote.monthlyCost?.toNumber() ?? 0;
    }
  }
  const additionalLinesTotal = quote.additionalLines.reduce(
    (s, l) => s + Number(l.precio || 0),
    0
  );
  const baseSaleClp = salePriceClp > 0 ? salePriceClp : (quote.monthlyCost?.toNumber() ?? 0);
  const rawMonthly = baseSaleClp + additionalLinesTotal;

  // Asignar precio venta a cada posición (proporción del base, sin líneas adicionales)
  const positionCosts = quote.positions.map((p) => Number(p.monthlyPositionCost ?? 0));
  const totalPositionCosts = positionCosts.reduce((s, c) => s + c, 0);
  const fallbackProportion = quote.positions.length > 0 ? 1 / quote.positions.length : 0;

  const positionsWithPrice = quote.positions.map((p) => {
    const costClp = Number(p.monthlyPositionCost ?? 0);
    const proportion = totalPositionCosts > 0 ? costClp / totalPositionCosts : fallbackProportion;
    const allocatedSaleClp = baseSaleClp * proportion;
    return {
      ...p,
      monthlyPositionCost: convertCost(costClp),
      displayPrice: convertCost(allocatedSaleClp),
    };
  });

  return NextResponse.json({
    success: true,
    data: {
      ...quote,
      monthlyCost: convertCost(rawMonthly),
      proposalLink,
      positions: positionsWithPrice,
      additionalLines: quote.additionalLines.map((l) => ({
        ...l,
        precio: convertCost(Number(l.precio) || 0),
      })),
    },
  });
}
