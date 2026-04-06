import { NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmView } from "@/lib/api-auth-crm";
import { prisma } from "@/lib/prisma";
import { requireTenantModule } from '@/lib/require-module';

/**
 * GET /api/crm/accounts/[id]/won-deals
 * Returns won deals for an account, with their active quote info.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const modCheck = await requireTenantModule('crm');
  if (!modCheck.authorized) return modCheck.response;

  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const forbidden = await requireCrmView(ctx, "accounts");
  if (forbidden) return forbidden;

  const { id } = await params;

  try {
    const deals = await prisma.crmDeal.findMany({
      where: {
        accountId: id,
        tenantId: ctx.tenantId,
        stage: { isClosedWon: true },
      },
      include: {
        stage: { select: { id: true, name: true } },
        quotes: { select: { quoteId: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    // Collect all quoteIds referenced by these deals
    const allQuoteIds = deals.flatMap((d) => d.quotes.map((q) => q.quoteId));
    const quotesById = new Map<
      string,
      {
        id: string;
        code: string;
        name: string | null;
        monthlyCost: number | null;
        totalPositions: number | null;
        totalGuards: number | null;
        status: string;
      }
    >();

    if (allQuoteIds.length > 0) {
      const cpqQuotes = await prisma.cpqQuote.findMany({
        where: { id: { in: allQuoteIds }, tenantId: ctx.tenantId },
        select: {
          id: true,
          code: true,
          clientName: true,
          monthlyCost: true,
          totalPositions: true,
          totalGuards: true,
          status: true,
        },
      });
      for (const q of cpqQuotes) {
        quotesById.set(q.id, {
          ...q,
          name: q.clientName ?? null,
          monthlyCost: q.monthlyCost ? Number(q.monthlyCost) : null,
        });
      }
    }

    // Resolve the active quote for each deal
    const data = deals.map((deal) => {
      const dealQuoteIds = deal.quotes.map((q) => q.quoteId);
      const activeId = deal.activeQuotationId ?? dealQuoteIds[0] ?? null;
      const activeQuote = activeId ? (quotesById.get(activeId) ?? null) : null;

      return {
        id: deal.id,
        title: deal.title,
        amount: deal.amount,
        status: deal.status,
        stageName: deal.stage?.name ?? null,
        installationName: deal.installationName,
        expectedCloseDate: deal.expectedCloseDate,
        activeQuotationId: deal.activeQuotationId,
        activeQuote: activeQuote
          ? {
              id: activeQuote.id,
              code: activeQuote.code,
              name: activeQuote.name,
              monthlyCost: activeQuote.monthlyCost,
              totalPositions: activeQuote.totalPositions,
              totalGuards: activeQuote.totalGuards,
            }
          : null,
        quotesCount: deal.quotes.length,
      };
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Error fetching won deals:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener negocios ganados" },
      { status: 500 }
    );
  }
}
