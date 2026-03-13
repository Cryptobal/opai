import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { parsePortalClienteSessionCookie } from "@/lib/portal-cliente";

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

  const data = quotes.map((q) => {
    const deal = q.dealId ? dealMap.get(q.dealId) : null;
    return {
      id: q.id,
      code: q.code,
      name: q.clientName,
      status: q.status,
      monthlyCost: q.monthlyCost?.toNumber() ?? 0,
      validUntil: q.validUntil,
      totalPositions: q.positions.length,
      totalGuards: q.positions.reduce((s, p) => s + (p.numGuards ?? 0), 0),
      currency: q.currency,
      createdAt: q.createdAt,
      dealId: q.dealId ?? null,
      dealTitle: deal?.title ?? null,
      proposalLink: deal?.proposalLink ?? null,
    };
  });

  return NextResponse.json({ success: true, data });
}
