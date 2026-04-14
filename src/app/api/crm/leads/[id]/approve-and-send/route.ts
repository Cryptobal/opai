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
import { requireTenantModule } from '@/lib/require-module';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const modCheck = await requireTenantModule('crm');
    if (!modCheck.authorized) return modCheck.response;

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

    // 2-5. Process ALL quotes (not just the first one)
    const sendResults: Array<{
      quoteId: string;
      status: "sent" | "error";
      error?: string;
      [key: string]: unknown;
    }> = [];

    for (const quote of quotes) {
      const quoteId = quote.id;

      // 2. Compute costs
      try {
        await computeCpqQuoteCosts(quoteId);
      } catch (err) {
        console.error(`[approve-and-send] Cost computation failed for ${quoteId}:`, err);
        sendResults.push({
          quoteId,
          status: "error",
          error: "CALCULATION_FAILED",
        });
        continue;
      }

      // 3. Transfer marginMode and financial config from body
      try {
        const paramUpdates: Record<string, unknown> = {};
        if (body.marginMode) paramUpdates.marginMode = body.marginMode;
        if (typeof body.financialRatePct === "number") paramUpdates.financialRatePct = body.financialRatePct;
        if (typeof body.financialEnabled === "boolean") paramUpdates.financialEnabled = body.financialEnabled;
        if (typeof body.policyEnabled === "boolean") paramUpdates.policyEnabled = body.policyEnabled;
        if (typeof body.policyRatePct === "number") paramUpdates.policyRatePct = body.policyRatePct;
        if (typeof body.policyContractMonths === "number") paramUpdates.policyContractMonths = body.policyContractMonths;
        if (typeof body.policyContractPct === "number") paramUpdates.policyContractPct = body.policyContractPct;

        if (Object.keys(paramUpdates).length > 0) {
          await prisma.cpqQuoteParameters.update({
            where: { quoteId },
            data: paramUpdates,
          });
        }
      } catch (err) {
        console.error(`[approve-and-send] Failed to transfer params for ${quoteId}:`, err);
        // Non-fatal: continue with defaults
      }

      // 4. Generate AI descriptions
      try {
        await generateQuoteDescription(quoteId, {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
        });
      } catch (err) {
        console.error(`[approve-and-send] AI description generation failed for ${quoteId}:`, err);
        // Non-fatal: continue without description
      }

      // 5. Validate that positions have non-zero costs
      const updatedQuote = await prisma.cpqQuote.findUnique({
        where: { id: quoteId },
        include: { positions: true },
      });

      const hasZeroValues = updatedQuote?.positions.some(
        (p) => !p.monthlyPositionCost || Number(p.monthlyPositionCost) === 0
      );

      if (hasZeroValues) {
        sendResults.push({
          quoteId,
          status: "error",
          error: "Posiciones con costo $0",
        });
        continue;
      }

      // 6. Send via portal
      try {
        const sendResult = await sendQuoteToPortal({
          quoteId,
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          followUp: { include: true, targetStageId: null },
        });

        sendResults.push({
          quoteId,
          status: "sent",
          ...sendResult,
        });
      } catch (sendErr) {
        console.error(`[approve-and-send] Send portal failed for ${quoteId}:`, sendErr);
        sendResults.push({
          quoteId,
          status: "error",
          error: sendErr instanceof Error ? sendErr.message : "Error al enviar",
        });
      }
    }

    const anySent = sendResults.some((r) => r.status === "sent");
    const firstSent = sendResults.find((r) => r.status === "sent");

    return NextResponse.json({
      success: anySent,
      data: {
        dealId: deal?.id,
        accountId: approveData.data.account?.id ?? null,
        contactId: approveData.data.contact?.id ?? null,
        results: sendResults,
        // Keep backward-compatible quoteId field (first sent quote)
        quoteId: firstSent?.quoteId ?? quotes[0].id,
        ...(firstSent || {}),
        // Explicitly expose WhatsApp fields for the post-send modal (same as send-portal)
        sentTo: firstSent?.sentTo,
        whatsappMessage: firstSent?.whatsappMessage,
        whatsappPhone: firstSent?.whatsappPhone ?? null,
      },
      ...(!anySent ? { error: "Ninguna cotización pudo enviarse. Revisa en el CPQ." } : {}),
    }, { status: anySent ? 200 : 422 });
  } catch (error) {
    console.error("Error in approve-and-send:", error);
    const message = error instanceof Error ? error.message : "Error al aprobar y enviar";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
