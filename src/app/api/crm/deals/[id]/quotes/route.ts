/**
 * API Route: /api/crm/deals/[id]/quotes
 * GET  - Listar cotizaciones vinculadas
 * POST - Vincular cotización CPQ
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, parseBody } from "@/lib/api-auth";
import { linkDealQuoteSchema } from "@/lib/validations/crm";
import { computeCpqQuoteCosts } from "@/modules/cpq/costing/compute-quote-costs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const { id } = await params;

    const links = await prisma.crmDealQuote.findMany({
      where: { tenantId: ctx.tenantId, dealId: id },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: links });
  } catch (error) {
    console.error("Error fetching CRM deal quotes:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch deal quotes" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const { id } = await params;
    const parsed = await parseBody(request, linkDealQuoteSchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    const link = await prisma.crmDealQuote.create({
      data: {
        tenantId: ctx.tenantId,
        dealId: id,
        quoteId: body.quoteId,
      },
    });

    await prisma.crmHistoryLog.create({
      data: {
        tenantId: ctx.tenantId,
        entityType: "deal",
        entityId: id,
        action: "deal_quote_linked",
        details: { quoteId: body.quoteId },
        createdBy: ctx.userId,
      },
    });

    // Sync deal amount from linked quote
    try {
      const costs = await computeCpqQuoteCosts(body.quoteId);
      if (costs.monthlyTotal > 0) {
        await prisma.crmDeal.update({
          where: { id },
          data: {
            amount: costs.monthlyTotal,
            totalPuestos: costs.totalGuards,
          },
        });
      }
    } catch (amountError) {
      console.error("Error syncing deal amount from quote:", amountError);
    }

    return NextResponse.json({ success: true, data: link }, { status: 201 });
  } catch (error: any) {
    if (error?.code === "P2002") {
      return NextResponse.json(
        { success: false, error: "Cotización ya vinculada" },
        { status: 409 }
      );
    }
    console.error("Error linking CRM deal quote:", error);
    return NextResponse.json(
      { success: false, error: "Failed to link deal quote" },
      { status: 500 }
    );
  }
}
