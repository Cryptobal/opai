/**
 * API Route: /api/cpq/quotes/[id]/margin
 * PUT - Actualizar margen de cotización
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCpqEdit } from "@/lib/api-auth-cpq";
import { createCrmHistoryLog } from "@/lib/crm-history";
import { computeCpqQuoteCosts } from "@/modules/cpq/costing/compute-quote-costs";
import { requireTenantModule } from '@/lib/require-module';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

    const updateData: Record<string, unknown> = { marginPct };
    if (marginMode) updateData.marginMode = marginMode;

    await prisma.cpqQuoteParameters.upsert({
      where: { quoteId: id },
      update: updateData,
      create: {
        quoteId: id,
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

    const summary = await computeCpqQuoteCosts(id);

    await prisma.cpqQuote.update({
      where: { id },
      data: { monthlyCost: summary.monthlyTotal },
    });

    const quote = await prisma.cpqQuote.findFirst({ where: { id, tenantId: ctx.tenantId }, select: { code: true } });
    await createCrmHistoryLog({
      tenantId: ctx.tenantId,
      entityType: "quote",
      entityId: id,
      action: "quote_margin_updated",
      details: { quoteCode: quote?.code ?? null, marginPct, marginMode: marginMode ?? null },
      createdBy: ctx.userId,
    });

    return NextResponse.json({ success: true, data: summary });
  } catch (error) {
    console.error("Error updating margin:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update margin" },
      { status: 500 }
    );
  }
}
