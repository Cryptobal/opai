/**
 * API Route: /api/crm/leads/[id]/approve-and-send
 * POST - Express flow: Approve lead + compute costs + generate AI descriptions + send via portal
 *
 * Combines the approve flow with send-portal in a single request.
 * If costs or AI generation fail, returns an error suggesting the user go to CPQ instead.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCrmEdit } from "@/lib/api-auth-crm";
import { computeCpqQuoteCosts } from "@/modules/cpq/costing/compute-quote-costs";
import { generateQuoteDescription } from "@/modules/cpq/descriptions/generate-descriptions";
import { sendQuoteToPortal } from "@/modules/cpq/send/send-quote-to-portal";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmEdit(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;

    // 1. Approve the lead via the existing approve endpoint (internal call)
    const body = await request.json();
    const approveUrl = new URL(`/api/crm/leads/${id}/approve`, request.url);
    const approveRes = await fetch(approveUrl.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: request.headers.get("cookie") || "",
      },
      body: JSON.stringify(body),
    });

    const approveData = await approveRes.json();
    if (!approveRes.ok || !approveData.success) {
      return NextResponse.json(approveData, { status: approveRes.status });
    }

    const { deal, quotes } = approveData.data;
    if (!quotes || quotes.length === 0) {
      return NextResponse.json({
        success: false,
        error: "No se crearon cotizaciones. Verifica que el lead tenga dotación.",
        dealId: deal?.id,
      }, { status: 422 });
    }

    const quoteId = quotes[0].id;

    // 2. Compute costs (already done in approve, but ensure it's complete)
    try {
      await computeCpqQuoteCosts(quoteId);
    } catch (err) {
      console.error("[approve-and-send] Cost computation failed:", err);
      return NextResponse.json({
        success: false,
        error: "CALCULATION_FAILED",
        message: "Error al calcular costos. Revisa la cotización en el CPQ.",
        quoteId,
        dealId: deal.id,
      }, { status: 422 });
    }

    // 3. Generate AI descriptions (await, since we need them for the PDF)
    try {
      await generateQuoteDescription(quoteId, {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
      });
    } catch (err) {
      console.error("[approve-and-send] AI description generation failed:", err);
      // Non-fatal: continue without description
    }

    // 4. Validate that positions have non-zero costs
    const updatedQuote = await prisma.cpqQuote.findUnique({
      where: { id: quoteId },
      include: { positions: true },
    });

    const hasZeroValues = updatedQuote?.positions.some(
      (p) => !p.monthlyPositionCost || Number(p.monthlyPositionCost) === 0
    );

    if (hasZeroValues) {
      return NextResponse.json({
        success: false,
        error: "CALCULATION_FAILED",
        message: "Algunos puestos tienen costo $0. Revisa en el CPQ.",
        quoteId,
        dealId: deal.id,
      }, { status: 422 });
    }

    // 5. Send via portal
    try {
      const sendResult = await sendQuoteToPortal({
        quoteId,
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        followUp: { include: true, targetStageId: null },
      });

      return NextResponse.json({
        success: true,
        data: {
          quoteId,
          dealId: deal.id,
          accountId: approveData.data.account.id,
          contactId: approveData.data.contact.id,
          ...sendResult,
        },
      });
    } catch (sendErr) {
      console.error("[approve-and-send] Send portal failed:", sendErr);
      return NextResponse.json({
        success: false,
        error: "SEND_FAILED",
        message: "Lead aprobado pero falló el envío. Puedes enviar desde el CPQ.",
        quoteId,
        dealId: deal.id,
      }, { status: 422 });
    }
  } catch (error) {
    console.error("Error in approve-and-send:", error);
    const message = error instanceof Error ? error.message : "Error al aprobar y enviar";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
