import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { parsePortalClienteSessionCookie } from "@/lib/portal-cliente";
import { getUfValue } from "@/lib/uf";
import { clpToUf } from "@/lib/uf-utils";

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

  return NextResponse.json({
    success: true,
    data: {
      ...quote,
      monthlyCost: convertCost(quote.monthlyCost?.toNumber() ?? 0),
      proposalLink,
      positions: quote.positions.map((p) => ({
        ...p,
        monthlyPositionCost: convertCost(p.monthlyPositionCost?.toNumber() ?? 0),
      })),
      additionalLines: quote.additionalLines.map((l) => ({
        ...l,
        precio: convertCost(Number(l.precio) || 0),
      })),
    },
  });
}
