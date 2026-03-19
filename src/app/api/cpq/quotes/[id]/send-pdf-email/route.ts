/**
 * API Route: /api/cpq/quotes/[id]/send-pdf-email
 * POST - Send quote PDF via email with custom compose body
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resend } from "@/lib/resend";
import { getTenantEmailConfig } from "@/lib/resend";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { computeCpqQuoteCosts } from "@/modules/cpq/costing/compute-quote-costs";
import { buildQuotationProps } from "@/lib/pdf/templates/quotation/build-quotation-props";
import { renderQuotationToBuffer } from "@/lib/pdf/templates/quotation/render-quotation";
import { buildProposalProps } from "@/lib/pdf/templates/proposal/build-proposal-props";
import { renderProposalToBufferFromProps } from "@/lib/pdf/templates/proposal/render-proposal";
import { getTenantCompanyConfig } from "@/lib/tenant-config";
import { render } from "@react-email/render";
import { CpqPdfEmail } from "@/emails/CpqPdfEmail";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const { id } = await params;
    const { to, cc, bcc, subject, htmlBody, followUp, includeProposalPdf } = await request.json();
    const followUpDecision = followUp as { include: boolean; targetStageId: string | null; skipAll?: boolean } | undefined;

    if (!to || !subject || !htmlBody) {
      return NextResponse.json(
        { success: false, error: "to, subject y htmlBody son requeridos" },
        { status: 400 }
      );
    }

    // Verify quote exists and fetch contact info for portal data
    const quote = await prisma.cpqQuote.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: {
        id: true,
        code: true,
        dealId: true,
        contactId: true,
        clientName: true,
        positions: { select: { numGuards: true, numPuestos: true } },
        installation: { select: { name: true } },
      },
    });

    if (!quote) {
      return NextResponse.json(
        { success: false, error: "Cotizacion no encontrada" },
        { status: 404 }
      );
    }

    // Fetch contact portal data
    let contactFirstName = quote.clientName?.split(" ")[0] || "Cliente";
    let portalPin: string | null = null;
    let portalEnabled = false;
    if (quote.contactId) {
      const contact = await prisma.crmContact.findUnique({
        where: { id: quote.contactId },
        select: { firstName: true, portalPinVisible: true, portalEnabled: true },
      });
      if (contact) {
        contactFirstName = contact.firstName;
        portalPin = contact.portalPinVisible || null;
        portalEnabled = contact.portalEnabled ?? false;
      }
    }

    // Sender info
    const sender = await prisma.admin.findUnique({
      where: { id: ctx.userId },
      select: { name: true, cargo: true },
    });
    const companyConfig = await getTenantCompanyConfig(ctx.tenantId);

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://opai.gard.cl";
    const portalUrl = portalEnabled ? `${baseUrl}/portal/cliente` : undefined;

    // Generate PDF
    const { fileName, ...pdfProps } = await buildQuotationProps(id, ctx.tenantId);
    const pdfBuffer = await renderQuotationToBuffer(pdfProps);

    const firstTo = Array.isArray(to) ? to[0] : String(to).trim();

    // Render full HTML with branded template
    const fullHtml = await render(
      CpqPdfEmail({
        recipientFirstName: contactFirstName,
        recipientEmail: firstTo?.includes("@") ? firstTo : undefined,
        companyName: undefined,
        quoteCode: quote.code,
        installationName: quote.installation?.name,
        bodyText: htmlBody,
        senderName: sender?.name || companyConfig.commercialName || "Equipo Comercial",
        senderCargo: sender?.cargo || "",
        brandName: companyConfig.commercialName || "Gard Security",
        brandPhone: companyConfig.phone || "",
        brandEmail: companyConfig.email || "",
        portalUrl,
        portalPin: portalEnabled ? portalPin : null,
      })
    );

    // Get tenant email config
    const emailConfig = await getTenantEmailConfig(ctx.tenantId);
    if (!emailConfig.from?.trim()) {
      return NextResponse.json(
        { success: false, error: "Configuración de email incompleta: falta 'from'. Revisa Configuración > Empresa." },
        { status: 500 }
      );
    }

    // Parse CC/BCC (comma-separated strings to arrays)
    const parseEmails = (str?: string): string[] =>
      str
        ? str.split(",").map((e: string) => e.trim()).filter((e: string) => e.includes("@"))
        : [];

    const ccList = parseEmails(cc);
    const bccList = parseEmails(bcc);

    // Resend expects `to` as string or string[]; normalize to array
    const toList = Array.isArray(to) ? to : [String(to).trim()].filter(Boolean);
    if (toList.length === 0) {
      return NextResponse.json(
        { success: false, error: "Al menos un destinatario (to) es requerido" },
        { status: 400 }
      );
    }

    // Update quote status to "sent" BEFORE email — visible in portal even if email fails.
    await prisma.cpqQuote.update({
      where: { id },
      data: { status: "sent" },
    });

    // Build attachments: PDF + optional proposal PDF + quote attachments
    const emailAttachments: { filename: string; content: Buffer; contentType: string }[] = [
      {
        filename: fileName,
        content: pdfBuffer,
        contentType: "application/pdf",
      },
    ];

    if (includeProposalPdf) {
      try {
        const { fileName: proposalFileName, ...proposalProps } = await buildProposalProps(id, ctx.tenantId);
        const proposalBuffer = await renderProposalToBufferFromProps(proposalProps);
        emailAttachments.push({
          filename: proposalFileName,
          content: proposalBuffer,
          contentType: "application/pdf",
        });
      } catch (err) {
        console.warn("[CPQ] Could not generate proposal PDF for email:", err);
      }
    }

    // Add quote attachments (documents from "Para adjuntar documentos")
    const quoteAttachments = await prisma.cpqQuoteAttachment.findMany({
      where: { quoteId: id, tenantId: ctx.tenantId },
      select: { fileName: true, publicUrl: true, mimeType: true, storageKey: true },
    });
    for (const att of quoteAttachments) {
      if (!att.publicUrl) continue;
      try {
        const res = await fetch(att.publicUrl);
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          emailAttachments.push({
            filename: att.fileName,
            content: buf,
            contentType: att.mimeType || "application/octet-stream",
          });
        }
      } catch (err) {
        console.warn("[CPQ] Could not fetch attachment for email:", att.fileName, err);
      }
    }

    const emailResult = await resend.emails.send({
      from: emailConfig.from,
      to: toList,
      ...(ccList.length > 0 && { cc: ccList }),
      ...(bccList.length > 0 && { bcc: bccList }),
      replyTo: emailConfig.replyTo,
      subject,
      html: fullHtml,
      attachments: emailAttachments,
      tags: [
        { name: "type", value: "cpq-quote-pdf" },
        { name: "quote", value: quote.code },
      ],
    });

    // Update deal: proposalSentAt, follow-ups, stage
    if (quote.dealId) {
      try {
        let monthlyTotal = 0;
        try {
          const costs = await computeCpqQuoteCosts(id);
          monthlyTotal = costs.monthlyTotal;
        } catch {}

        await prisma.crmDeal.update({
          where: { id: quote.dealId },
          data: {
            proposalSentAt: new Date(),
            amount: monthlyTotal,
            totalPuestos: quote.positions.reduce(
              (s: number, p: { numGuards: number; numPuestos: number | null }) =>
                s + p.numGuards * (p.numPuestos || 1),
              0
            ),
          },
        });

        if (followUpDecision?.skipAll) {
          // "No hacer nada": solo enviar, no tocar follow-ups ni etapa
        } else if (followUpDecision?.include === false) {
          // User chose NOT to include follow-up: cancel existing + move to chosen stage
          const { cancelPendingFollowUps } = await import("@/lib/followup-scheduler");
          await cancelPendingFollowUps(quote.dealId, "Usuario eligió no incluir seguimiento");

          if (followUpDecision.targetStageId) {
            const targetStage = await prisma.crmPipelineStage.findFirst({
              where: { id: followUpDecision.targetStageId, tenantId: ctx.tenantId, isActive: true },
            });
            if (targetStage) {
              const deal = await prisma.crmDeal.findFirst({ where: { id: quote.dealId } });
              if (deal && deal.stageId !== targetStage.id) {
                await prisma.crmDeal.update({
                  where: { id: deal.id },
                  data: { stageId: targetStage.id },
                });
                await prisma.crmDealStageHistory.create({
                  data: {
                    tenantId: ctx.tenantId,
                    dealId: deal.id,
                    fromStageId: deal.stageId,
                    toStageId: targetStage.id,
                    changedBy: ctx.userId,
                  },
                });
              }
            }
          }
        } else {
          // Default: schedule follow-ups + move to "Cotización enviada"
          const { scheduleFollowUps } = await import("@/lib/followup-scheduler");
          await scheduleFollowUps({ tenantId: ctx.tenantId, dealId: quote.dealId });

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
                data: {
                  tenantId: ctx.tenantId,
                  dealId: deal.id,
                  fromStageId: deal.stageId,
                  toStageId: cotizacionStage.id,
                  changedBy: ctx.userId,
                },
              });
            }
          }
        }
      } catch (followUpError) {
        console.error("Error scheduling follow-ups from send-pdf-email:", followUpError);
      }
    }

    // Log in CRM history
    await prisma.crmHistoryLog.create({
      data: {
        tenantId: ctx.tenantId,
        entityType: "quote",
        entityId: id,
        action: "quote_pdf_sent",
        details: {
          to,
          cc: cc || null,
          bcc: bcc || null,
          subject,
          quoteCode: quote.code,
          emailId: emailResult?.data?.id || null,
        },
        createdBy: ctx.userId,
      },
    });

    return NextResponse.json({
      success: true,
      data: { emailId: emailResult?.data?.id },
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error("Error sending PDF email:", err.message, err.stack);
    // Exponer mensaje para diagnóstico (evitar stack traces sensibles)
    const safeMessage = err.message || "Error desconocido";
    return NextResponse.json(
      { success: false, error: `Error al enviar email: ${safeMessage}` },
      { status: 500 }
    );
  }
}
