/**
 * API Route: /api/cpq/quotes/[id]/send-email
 * POST - Send quote via email with PDF attachment
 */

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { render } from "@react-email/render";
import { prisma } from "@/lib/prisma";
import { resend, EMAIL_CONFIG } from "@/lib/resend";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { computeCpqQuoteCosts } from "@/modules/cpq/costing/compute-quote-costs";
import { formatCurrency } from "@/lib/utils";
import { CpqQuoteEmail } from "@/emails/CpqQuoteEmail";
import { buildQuotationProps } from "@/lib/pdf/templates/quotation/build-quotation-props";
import { renderQuotationToBuffer } from "@/lib/pdf/templates/quotation/render-quotation";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const { id } = await params;

    // Get quote with full context
    const quote = await prisma.cpqQuote.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        positions: {
          include: { puestoTrabajo: true },
        },
        installation: true,
      },
    });

    if (!quote) {
      return NextResponse.json(
        { success: false, error: "Cotización no encontrada" },
        { status: 404 }
      );
    }

    // Validate required CRM context
    if (!quote.dealId) {
      return NextResponse.json(
        { success: false, error: "La cotización debe tener un negocio asignado" },
        { status: 400 }
      );
    }
    if (!quote.contactId) {
      return NextResponse.json(
        { success: false, error: "La cotización debe tener un contacto asignado" },
        { status: 400 }
      );
    }

    const contact = await prisma.crmContact.findUnique({
      where: { id: quote.contactId },
      select: { firstName: true, lastName: true, email: true, portalEnabled: true },
    });

    if (!contact?.email) {
      return NextResponse.json(
        { success: false, error: "El contacto no tiene email" },
        { status: 400 }
      );
    }

    // Get account name
    let accountName = quote.clientName || "Cliente";
    if (quote.accountId) {
      const account = await prisma.crmAccount.findUnique({
        where: { id: quote.accountId },
        select: { name: true },
      });
      if (account) accountName = account.name;
    }

    // Get deal (negocio) name
    let dealName = "";
    if (quote.dealId) {
      const deal = await prisma.crmDeal.findUnique({
        where: { id: quote.dealId },
        select: { title: true },
      });
      if (deal) dealName = deal.title;
    }

    // Installation name
    const installationName = quote.installation?.name || "";

    // Compute costs for email body
    let monthlyTotal = Number(quote.monthlyCost) || 0;
    try {
      const costs = await computeCpqQuoteCosts(id);
      monthlyTotal = costs.monthlyTotal;
    } catch {}

    const contactName = `${contact.firstName} ${contact.lastName}`.trim();
    const validUntilStr = quote.validUntil
      ? new Date(quote.validUntil).toLocaleDateString("es-CL")
      : "";

    // Generate real PDF using @react-pdf/renderer
    const { fileName: pdfFileName, ...pdfProps } = await buildQuotationProps(id, ctx.tenantId);
    const pdfBuffer = await renderQuotationToBuffer(pdfProps);

    // Generate portal magic token for contact
    let portalUrl: string | undefined;
    const magicToken = randomUUID();
    const tokenExp = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48h
    await prisma.crmContact.update({
      where: { id: quote.contactId },
      data: {
        portalMagicToken: magicToken,
        portalMagicTokenExp: tokenExp,
        portalEnabled: true,
      },
    });
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://app.gardsecurity.cl";
    portalUrl = `${baseUrl}/portal/cliente/setup?token=${magicToken}`;

    // Render email HTML
    const emailHtml = await render(
      CpqQuoteEmail({
        recipientName: contactName,
        companyName: accountName,
        quoteCode: quote.code,
        totalGuards: quote.totalGuards,
        totalPositions: quote.totalPositions,
        monthlyCost: formatCurrency(monthlyTotal, "CLP"),
        validUntil: validUntilStr,
        aiDescription: quote.aiDescription || "",
        serviceDetail: quote.serviceDetail || "",
        businessName: dealName,
        installationName,
        portalUrl,
      })
    );

    // Send email via Resend with real PDF attachment
    const emailResult = await resend.emails.send({
      from: EMAIL_CONFIG.from,
      to: contact.email,
      replyTo: EMAIL_CONFIG.replyTo,
      subject: `Propuesta económica ${quote.code} - Gard Security`,
      html: emailHtml,
      attachments: [
        {
          filename: pdfFileName,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
      tags: [
        { name: "type", value: "cpq-quote" },
        { name: "quote", value: quote.code },
      ],
    });

    // Update quote status to sent
    await prisma.cpqQuote.update({
      where: { id },
      data: { status: "sent" },
    });

    // Update deal proposalSentAt and schedule follow-ups
    if (quote.dealId) {
      try {
        await prisma.crmDeal.update({
          where: { id: quote.dealId },
          data: {
            proposalSentAt: new Date(),
            amount: monthlyTotal,
            totalPuestos: quote.positions.reduce(
              (s, p) => s + p.numGuards * (p.numPuestos || 1),
              0
            ),
          },
        });

        const { scheduleFollowUps } = await import("@/lib/followup-scheduler");
        await scheduleFollowUps({ tenantId: ctx.tenantId, dealId: quote.dealId });

        // Move deal to "Cotización enviada" stage
        const cotizacionStage = await prisma.crmPipelineStage.findFirst({
          where: { tenantId: ctx.tenantId, name: "Cotización enviada", isActive: true },
        });
        if (cotizacionStage) {
          const deal = await prisma.crmDeal.findFirst({ where: { id: quote.dealId } });
          if (deal && deal.stageId !== cotizacionStage.id) {
            await prisma.crmDeal.update({
              where: { id: deal.id },
              data: { stageId: cotizacionStage.id },
            });
            await prisma.crmDealStageHistory.create({
              data: { tenantId: ctx.tenantId, dealId: deal.id, fromStageId: deal.stageId, toStageId: cotizacionStage.id, changedBy: ctx.userId },
            });
          }
        }
      } catch (followUpError) {
        console.error("Error scheduling follow-ups from send-email:", followUpError);
      }
    }

    // Log in CRM history
    await prisma.crmHistoryLog.create({
      data: {
        tenantId: ctx.tenantId,
        entityType: "quote",
        entityId: id,
        action: "quote_sent",
        details: {
          to: contact.email,
          contactName,
          quoteCode: quote.code,
          emailId: emailResult?.data?.id || null,
          portalUrl: portalUrl ?? null,
        },
        createdBy: ctx.userId,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        emailId: emailResult?.data?.id,
        sentTo: contact.email,
      },
    });
  } catch (error) {
    console.error("Error sending CPQ quote email:", error);
    return NextResponse.json(
      { success: false, error: "Failed to send email" },
      { status: 500 }
    );
  }
}
