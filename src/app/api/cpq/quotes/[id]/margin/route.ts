/**
 * API Route: /api/cpq/quotes/[id]/margin
 * PUT - Actualizar margen de cotización
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeCpqQuoteCosts } from "@/modules/cpq/costing/compute-quote-costs";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const marginPct = body?.marginPct ?? 13;

    await prisma.cpqQuoteParameters.upsert({
      where: { quoteId: id },
      update: { marginPct },
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
      },
    });

    const summary = await computeCpqQuoteCosts(id);

    await prisma.cpqQuote.update({
      where: { id },
      data: { monthlyCost: summary.monthlyTotal },
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
