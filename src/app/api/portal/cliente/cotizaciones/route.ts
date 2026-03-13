import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { parsePortalClienteSessionCookie } from "@/lib/portal-cliente";
import { getUfValue } from "@/lib/uf";
import { clpToUf } from "@/lib/uf-utils";

export async function GET() {
  const cookieStore = await cookies();
  const session = parsePortalClienteSessionCookie(
    cookieStore.get("portal_cliente_session")?.value
  );
  if (!session) return NextResponse.json({ error: "No session" }, { status: 401 });

  const quotes = await prisma.cpqQuote.findMany({
    where: { accountId: session.accountId, tenantId: session.tenantId },
    include: {
      positions: { select: { id: true, numGuards: true } },
      parameters: { select: { salePriceMonthly: true } },
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

  const data = quotes.map((q) => {
    const deal = q.dealId ? dealMap.get(q.dealId) : null;
    // Precio venta mensual neto (salePriceMonthly) cuando existe; sino monthlyCost (costo)
    const salePriceClp = q.parameters?.salePriceMonthly != null
      ? Number(q.parameters.salePriceMonthly)
      : 0;
    const rawCost = salePriceClp > 0 ? salePriceClp : (q.monthlyCost?.toNumber() ?? 0);
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
