/**
 * API Route: /api/cpq/quotes/[id]/send-portal
 * POST - Send quote via Portal del Cliente with auto-prospect setup
 *
 * Delegates to the reusable sendQuoteToPortal function.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { sendQuoteToPortal } from "@/modules/cpq/send/send-quote-to-portal";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const { id } = await params;

    const body = await _request.json().catch(() => ({}));
    const followUpDecision = (body?.followUp as { include: boolean; targetStageId: string | null; skipAll?: boolean } | undefined);
    const ccEmails: string[] = Array.isArray(body?.ccEmails) ? body.ccEmails.filter(Boolean) : [];
    const bccEmails: string[] = Array.isArray(body?.bccEmails) ? body.bccEmails.filter(Boolean) : [];
    const includeProposalPdf = Boolean(body?.includeProposalPdf);
    const includeQuotationPdf = Boolean(body?.includeQuotationPdf);
    const recipientContactId =
      typeof body?.recipientContactId === "string" && body.recipientContactId.length > 0
        ? body.recipientContactId
        : undefined;
    const ccContactIds: string[] = Array.isArray(body?.ccContactIds)
      ? body.ccContactIds.filter((x: unknown) => typeof x === "string")
      : [];
    const attachmentIds: string[] = Array.isArray(body?.attachmentIds)
      ? body.attachmentIds.filter((x: unknown) => typeof x === "string")
      : [];
    const emailSubject =
      typeof body?.emailSubject === "string" ? body.emailSubject : undefined;

    const result = await sendQuoteToPortal({
      quoteId: id,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      followUp: followUpDecision,
      ccEmails,
      bccEmails,
      recipientContactId,
      ccContactIds,
      includeProposalPdf,
      includeQuotationPdf,
      attachmentIds,
      emailSubject,
    });

    return NextResponse.json({
      success: true,
      data: {
        emailId: result.emailId,
        sentTo: result.sentTo,
        portalUrl: result.portalUrl,
        pinGenerated: result.pinGenerated,
        proposalLink: result.proposalLink,
        whatsappPhone: result.whatsappPhone,
        whatsappMessage: result.whatsappMessage,
      },
    });
  } catch (error) {
    console.error("Error sending CPQ quote via portal:", error);
    const message = error instanceof Error ? error.message : "Error al enviar por portal";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
