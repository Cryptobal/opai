/**
 * API Route: /api/crm/deals/[id]/quotes
 * GET  - Listar cotizaciones vinculadas
 * POST - Vincular cotización CPQ
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDefaultTenantId } from "@/lib/tenant";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    const tenantId = session?.user?.tenantId ?? (await getDefaultTenantId());

    const links = await prisma.crmDealQuote.findMany({
      where: { tenantId, dealId: params.id },
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
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    const tenantId = session?.user?.tenantId ?? (await getDefaultTenantId());
    const body = await request.json();

    if (!body?.quoteId) {
      return NextResponse.json(
        { success: false, error: "quoteId es requerido" },
        { status: 400 }
      );
    }

    const link = await prisma.crmDealQuote.create({
      data: {
        tenantId,
        dealId: params.id,
        quoteId: body.quoteId,
      },
    });

    await prisma.crmHistoryLog.create({
      data: {
        tenantId,
        entityType: "deal",
        entityId: params.id,
        action: "deal_quote_linked",
        details: { quoteId: body.quoteId },
        createdBy: session?.user?.id || null,
      },
    });

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
