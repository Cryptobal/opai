/**
 * API Route: /api/cpq/quotes/[id]/send-presentation
 * POST - Send CPQ quote as a Presentation (public URL + email)
 *
 * Replaces the old send-email flow that attached an HTML file.
 * Creates a Presentation record with a public URL (/p/uniqueId),
 * sends the link via email, and links it to the deal.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { resend, EMAIL_CONFIG } from "@/lib/resend";
import { computeCpqQuoteCosts } from "@/modules/cpq/costing/compute-quote-costs";
import { mapCpqDataToPresentation } from "@/lib/cpq-mapper";
import { getUfValue } from "@/lib/uf";
import { PresentationEmail } from "@/emails/PresentationEmail";
import { render } from "@react-email/render";
import { nanoid } from "nanoid";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const { id } = await params;
    const body = await request.json();
    const {
      templateSlug = "commercial",
      recipientEmail: customEmail,
      recipientName: customName,
      ccEmails = [],
    } = body;

    // 1. Load quote with full CRM context
    const quote = await prisma.cpqQuote.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        positions: {
          include: { puestoTrabajo: true },
        },
        parameters: true,
        installation: true,
      },
    });

    if (!quote) {
      return NextResponse.json(
        { success: false, error: "Cotización no encontrada" },
        { status: 404 }
      );
    }

    // 2. Validate required CRM context
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
      select: { firstName: true, lastName: true, email: true, phone: true, roleTitle: true },
    });
    if (!contact?.email) {
      return NextResponse.json(
        { success: false, error: "El contacto no tiene email" },
        { status: 400 }
      );
    }

    const recipientEmail = customEmail || contact.email;
    const recipientName =
      customName || `${contact.firstName} ${contact.lastName}`.trim();

    // 3. Load account (with notes for logo + company description)
    const ACCOUNT_LOGO_MARKER_PREFIX = "[[ACCOUNT_LOGO_URL:";
    const ACCOUNT_LOGO_MARKER_SUFFIX = "]]";
    function extractAccountLogoUrl(notes: string | null | undefined): string | null {
      if (!notes) return null;
      const start = notes.indexOf(ACCOUNT_LOGO_MARKER_PREFIX);
      if (start === -1) return null;
      const end = notes.indexOf(ACCOUNT_LOGO_MARKER_SUFFIX, start);
      if (end === -1) return null;
      const raw = notes.slice(start + ACCOUNT_LOGO_MARKER_PREFIX.length, end).trim();
      return raw || null;
    }
    function stripAccountLogoMarker(notes: string | null | undefined): string {
      if (!notes) return "";
      return notes.replace(/\[\[ACCOUNT_LOGO_URL:[^\]]+\]\]\n?/g, "").trim();
    }
    let account: {
      name: string;
      logoUrl?: string | null;
      companyDescription?: string;
      industry?: string | null;
      segment?: string | null;
    } | null = null;
    if (quote.accountId) {
      const acc = await prisma.crmAccount.findUnique({
        where: { id: quote.accountId },
        select: { name: true, notes: true, industry: true, segment: true },
      });
      if (acc) {
        const logoUrl = extractAccountLogoUrl(acc.notes);
        const companyDescription = stripAccountLogoMarker(acc.notes);
        account = {
          name: acc.name,
          logoUrl: logoUrl || null,
          companyDescription: companyDescription || undefined,
          industry: acc.industry || undefined,
          segment: acc.segment || undefined,
        };
      }
    }
    const companyName = account?.name || quote.clientName || "Cliente";

    // 3b. Load deal (negocio) name
    let deal: { title: string } | null = null;
    if (quote.dealId) {
      const d = await prisma.crmDeal.findUnique({
        where: { id: quote.dealId },
        select: { title: true },
      });
      if (d) deal = { title: d.title };
    }

    // 3c. Load additional lines
    const additionalLines = await prisma.cpqQuoteAdditionalLine.findMany({
      where: { quoteId: id },
      orderBy: { orden: "asc" },
    });
    const totalAdditionalLines = additionalLines.reduce(
      (sum, l) => sum + Number(l.precio),
      0
    );

    // 4. Compute costs & sale prices
    let summary: Awaited<ReturnType<typeof computeCpqQuoteCosts>> | null = null;
    try {
      summary = await computeCpqQuoteCosts(id);
    } catch {}

    const marginPct = Number(quote.parameters?.marginPct ?? 13);
    const margin = marginPct / 100;
    const financialRatePctVal = Number(quote.parameters?.financialRatePct ?? 2.5);
    const policyRatePctVal = Number(quote.parameters?.policyRatePct ?? 0);
    const policyContractMonthsVal = Number(quote.parameters?.policyContractMonths ?? 12);
    const policyContractPctVal = Number(quote.parameters?.policyContractPct ?? 100);
    const contractMonthsVal = Number(quote.parameters?.contractMonths ?? 12);
    const policyFactor =
      contractMonthsVal > 0
        ? (policyContractMonthsVal * (policyContractPctVal / 100)) / contractMonthsVal
        : 0;

    const totalGuards =
      summary?.totalGuards ??
      quote.positions.reduce(
        (s: number, p: { numGuards: number; numPuestos?: number }) =>
          s + p.numGuards * (p.numPuestos || 1),
        0
      );
    const baseAdditionalCostsTotal = summary
      ? Math.max(0, (summary.monthlyExtras ?? 0) - (summary.monthlyFinancial ?? 0) - (summary.monthlyPolicy ?? 0))
      : 0;

    // Per-position sale prices
    const positionSalePrices = new Map<string, number>();
    for (const pos of quote.positions) {
      const guardsInPosition = pos.numGuards * (pos.numPuestos || 1);
      const proportion = totalGuards > 0 ? guardsInPosition / totalGuards : 0;
      const additionalForPos = baseAdditionalCostsTotal * proportion;
      const totalCostPos = Number(pos.monthlyPositionCost) + additionalForPos;
      const bwm = margin < 1 ? totalCostPos / (1 - margin) : totalCostPos;
      const fc = bwm * (financialRatePctVal / 100);
      const pc = bwm * (policyRatePctVal / 100) * policyFactor;
      positionSalePrices.set(pos.id, bwm + fc + pc);
    }

    // Total sale price
    let salePriceMonthly = 0;
    if (summary) {
      const costsBase =
        summary.monthlyPositions +
        (summary.monthlyUniforms ?? 0) +
        (summary.monthlyExams ?? 0) +
        (summary.monthlyMeals ?? 0) +
        (summary.monthlyVehicles ?? 0) +
        (summary.monthlyInfrastructure ?? 0) +
        (summary.monthlyCostItems ?? 0);
      const bwm = margin < 1 ? costsBase / (1 - margin) : costsBase;
      salePriceMonthly = bwm + (summary.monthlyFinancial ?? 0) + (summary.monthlyPolicy ?? 0);
    }

    // 5. Find template
    const template = await prisma.template.findFirst({
      where: { slug: templateSlug, active: true, tenantId: ctx.tenantId },
    });
    if (!template) {
      return NextResponse.json(
        { success: false, error: `Template "${templateSlug}" no encontrado` },
        { status: 404 }
      );
    }

    // 6. Generate unique ID & public URL
    const uniqueId = nanoid(12);
    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.SITE_URL ||
      "https://opai.gard.cl";
    const presentationUrl = `${siteUrl}/p/${uniqueId}`;

    // 7. Map CPQ data to PresentationPayload
    const sessionId = `cpq_${nanoid(16)}`;
    const ufValue =
      quote.currency === "UF" ? await getUfValue() : undefined;
    const payload = mapCpqDataToPresentation(
      {
        ufValue,
        quote: {
          id: quote.id,
          code: quote.code,
          clientName: quote.clientName,
          validUntil: quote.validUntil,
          notes: quote.notes,
          aiDescription: quote.aiDescription,
          currency: quote.currency,
        },
        positions: quote.positions,
        account,
        deal,
        contact,
        installation: quote.installation,
        salePriceMonthly,
        positionSalePrices,
        siteUrl,
        additionalLines: additionalLines.map((l) => ({
          nombre: l.nombre,
          descripcion: l.descripcion,
          precio: Number(l.precio),
          orden: l.orden,
        })),
        totalAdditionalLines,
      },
      sessionId,
      templateSlug
    );

    // 8. Create WebhookSession (to be compatible with preview system)
    await prisma.webhookSession.create({
      data: {
        sessionId,
        tenantId: ctx.tenantId,
        zohoData: JSON.parse(JSON.stringify(payload)),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        status: "completed",
      },
    });

    // 9. Create Presentation record
    const presentation = await prisma.presentation.create({
      data: {
        uniqueId,
        templateId: template.id,
        tenantId: ctx.tenantId,
        clientData: JSON.parse(JSON.stringify(payload)),
        quoteId: quote.id,
        status: "sent",
        recipientEmail,
        recipientName,
        ccEmails: ccEmails.filter((e: string) => e && e.trim()),
        emailSentAt: new Date(),
        emailProvider: "resend",
        tags: ["cpq", "auto-sent"],
      },
    });

    // 10. Send email with presentation link
    const validUntilStr = quote.validUntil
      ? new Date(quote.validUntil).toLocaleDateString("es-CL", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : undefined;

    const emailHtml = await render(
      PresentationEmail({
        recipientName,
        companyName,
        subject: `Propuesta de Servicio de Seguridad - ${companyName}`,
        presentationUrl,
        quoteNumber: quote.code,
        senderName: "Equipo Comercial Gard",
        expiryDate: validUntilStr,
      })
    );

    const emailResult = await resend.emails.send({
      from: EMAIL_CONFIG.from,
      to: recipientEmail,
      cc: ccEmails.filter((e: string) => e && e.trim()),
      replyTo: EMAIL_CONFIG.replyTo,
      subject: `Propuesta de Servicio ${quote.code} - Gard Security`,
      html: emailHtml,
      tags: [
        { name: "type", value: "cpq-presentation" },
        { name: "quote", value: quote.code },
      ],
    });

    if (emailResult.error) {
      console.error("Error sending email:", emailResult.error);
      return NextResponse.json(
        { success: false, error: "Error al enviar el email" },
        { status: 500 }
      );
    }

    // 11. Update presentation with email message ID
    await prisma.presentation.update({
      where: { id: presentation.id },
      data: { emailMessageId: emailResult.data?.id || null },
    });

    // 12. Update template usage
    await prisma.template.update({
      where: { id: template.id },
      data: { usageCount: { increment: 1 } },
    });

    // 13. Update quote status
    await prisma.cpqQuote.update({
      where: { id },
      data: { status: "sent" },
    });

    // 14. Log in CRM history (linked to both quote and deal)
    await prisma.crmHistoryLog.create({
      data: {
        tenantId: ctx.tenantId,
        entityType: "quote",
        entityId: id,
        action: "presentation_sent",
        details: {
          to: recipientEmail,
          contactName: recipientName,
          quoteCode: quote.code,
          presentationUrl,
          presentationId: presentation.id,
          uniqueId,
          emailId: emailResult.data?.id || null,
          templateSlug,
        },
        createdBy: ctx.userId,
      },
    });

    // If deal is linked, update deal's proposal link and log there
    if (quote.dealId) {
      const deal = await prisma.crmDeal.findFirst({
        where: { id: quote.dealId, tenantId: ctx.tenantId },
      });
      if (deal) {
        await prisma.crmDeal.update({
          where: { id: quote.dealId },
          data: {
            proposalLink: presentationUrl,
            proposalSentAt: new Date(),
            amount: salePriceMonthly + totalAdditionalLines,
            totalPuestos: totalGuards,
          },
        });

        // ── Programar follow-ups automáticos ──
        try {
          const { scheduleFollowUps } = await import("@/lib/followup-scheduler");
          await scheduleFollowUps({ tenantId: ctx.tenantId, dealId: deal.id });
        } catch (followUpError) {
          console.error("Error programando follow-ups:", followUpError);
        }

        // ── Mover deal a "Cotización enviada" automáticamente ──
        try {
          const cotizacionStage = await prisma.crmPipelineStage.findFirst({
            where: {
              tenantId: ctx.tenantId,
              name: "Cotización enviada",
              isActive: true,
            },
          });

          if (cotizacionStage && deal.stageId !== cotizacionStage.id) {
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
        } catch (stageError) {
          console.error("Error actualizando etapa del deal:", stageError);
        }
      }
      await prisma.crmHistoryLog.create({
        data: {
          tenantId: ctx.tenantId,
          entityType: "deal",
          entityId: quote.dealId,
          action: "presentation_sent",
          details: {
            quoteCode: quote.code,
            presentationUrl,
            presentationId: presentation.id,
            recipientEmail,
          },
          createdBy: ctx.userId,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        presentationId: presentation.id,
        uniqueId,
        publicUrl: presentationUrl,
        sentTo: recipientEmail,
        emailId: emailResult.data?.id || null,
      },
    });
  } catch (error) {
    console.error("Error sending CPQ presentation:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
