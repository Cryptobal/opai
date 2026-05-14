/**
 * API Route: /api/cpq/quotes/[id]/margin
 * PUT - Actualizar margen de cotización
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCpqEdit } from "@/lib/api-auth-cpq";
import { createCrmHistoryLog } from "@/lib/crm-history";
import { computeCpqQuoteCosts } from "@/modules/cpq/costing/compute-quote-costs";
import { prisma } from "@/lib/prisma";
import { requireTenantModule } from '@/lib/require-module';
import { updateCpqQuoteMargin } from "@/modules/cpq/update-quote-margin.service";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const modCheck = await requireTenantModule('cpq');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCpqEdit(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;
    const body = await request.json();
    const marginPct = body?.marginPct ?? 13;
    const marginMode = body?.marginMode;

    const owns = await prisma.cpqQuote.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!owns) {
      return NextResponse.json({ success: false, error: "Quote not found" }, { status: 404 });
    }

    await updateCpqQuoteMargin({
      quoteId: id,
      marginPct: Number(marginPct),
      marginMode: typeof marginMode === "string" ? marginMode : null,
    });

    const summary = await computeCpqQuoteCosts(id);

    const quoteMeta = await prisma.cpqQuote.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { code: true },
    });
    await createCrmHistoryLog({
      tenantId: ctx.tenantId,
      entityType: "quote",
      entityId: id,
      action: "quote_margin_updated",
      details: {
        quoteCode: quoteMeta?.code ?? null,
        marginPct: Number(marginPct),
        marginMode: marginMode ?? null,
      },
      createdBy: ctx.userId,
    });

    return NextResponse.json({ success: true, data: summary });
  } catch (error) {
    console.error("Error updating margin:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update margin" },
      { status: 500 },
    );
  }
}
