/**
 * API Route: /api/cpq/quotes/[id]/create-draft
 * POST - Create a draft Presentation from CPQ quote (no email sent)
 *
 * Creates a WebhookSession + Presentation with status "draft",
 * returns a preview URL so the user can review before sending.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { computeCpqQuoteCosts } from "@/modules/cpq/costing/compute-quote-costs";
import { mapCpqDataToPresentation } from "@/lib/cpq-mapper";
import { getUfValue } from "@/lib/uf";
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

    // 3a. Load deal (negocio) name
    let deal: { title: string } | null = null;
    if (quote.dealId) {
      const d = await prisma.crmDeal.findUnique({
        where: { id: quote.dealId },
        select: { title: true },
      });
      if (d) deal = { title: d.title };
    }

    // 3. Load account (with notes for logo + company description)
    const ACCOUNT_LOGO_PREFIX = "[[ACCOUNT_LOGO_URL:";
    const ACCOUNT_LOGO_SUFFIX = "]]";
    function extractLogo(notes: string | null | undefined): string | null {
      if (!notes) return null;
      const s = notes.indexOf(ACCOUNT_LOGO_PREFIX);
      if (s === -1) return null;
      const e = notes.indexOf(ACCOUNT_LOGO_SUFFIX, s);
      if (e === -1) return null;
      return notes.slice(s + ACCOUNT_LOGO_PREFIX.length, e).trim() || null;
    }
    function stripLogo(notes: string | null | undefined): string {
      if (!notes) return "";
      return notes.replace(/\[\[ACCOUNT_LOGO_URL:[^\]]+\]\]\n?/g, "").trim();
    }
    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.SITE_URL ||
      "https://opai.gard.cl";
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
        account = {
          name: acc.name,
          logoUrl: extractLogo(acc.notes),
          companyDescription: stripLogo(acc.notes) || undefined,
          industry: acc.industry || undefined,
          segment: acc.segment || undefined,
        };
      }
    }

    // 4. Compute costs & sale prices
    let summary: Awaited<ReturnType<typeof computeCpqQuoteCosts>> | null = null;
    try {
      summary = await computeCpqQuoteCosts(id);
    } catch (e) {
      console.warn("Error computing CPQ costs for draft, continuing:", e);
    }

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
      quote.positions.reduce((s, p) => s + p.numGuards * (p.numPuestos || 1), 0);
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

    // 6. Generate unique ID & session ID
    const uniqueId = nanoid(12);
    const sessionId = `cpq_${nanoid(16)}`;

    // 7. Map CPQ data to PresentationPayload
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
          serviceDetail: quote.serviceDetail,
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
      },
      sessionId,
      templateSlug
    );

    // 8. Store extra metadata in payload for send-email to use later
    const payloadWithMeta = {
      ...JSON.parse(JSON.stringify(payload)),
      // Metadata for the send-email endpoint to update CPQ quote status
      _cpqQuoteId: quote.id,
      _cpqQuoteCode: quote.code,
      _cpqDealId: quote.dealId || null,
      // Contact data for the send modal
      contact: {
        ...payload.contact,
        First_Name: contact.firstName,
        Last_Name: contact.lastName,
        Email: contact.email,
        Phone: contact.phone,
      },
      // Quote data in Zoho-compatible format for the send-email endpoint
      quote: {
        ...payload.quote,
        Subject: `Propuesta de Servicio de Seguridad - ${account?.name || quote.clientName || "Cliente"}`,
        Quote_Number: quote.code,
        Valid_Till: quote.validUntil ? new Date(quote.validUntil).toISOString() : null,
      },
      account: {
        ...payload.client,
        Account_Name: account?.name || quote.clientName || "Cliente",
      },
    };

    // 9. Create WebhookSession (compatible with preview system)
    await prisma.webhookSession.create({
      data: {
        sessionId,
        tenantId: ctx.tenantId,
        zohoData: payloadWithMeta,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        status: "pending", // draft, not completed
      },
    });

    // 10. Create Presentation record as DRAFT
    await prisma.presentation.create({
      data: {
        uniqueId,
        templateId: template.id,
        tenantId: ctx.tenantId,
        clientData: payloadWithMeta,
        quoteId: quote.id,
        status: "draft",
        recipientEmail,
        recipientName,
        ccEmails: ccEmails.filter((e: string) => e && e.trim()),
        tags: ["cpq", "draft"],
      },
    });

    // 11. Preview URL (the /preview/[sessionId] route)
    const previewUrl = `${siteUrl}/preview/${sessionId}?template=${templateSlug}`;

    return NextResponse.json({
      success: true,
      data: {
        sessionId,
        uniqueId,
        previewUrl,
        recipientEmail,
        recipientName,
      },
    });
  } catch (error) {
    console.error("Error creating CPQ draft:", error);
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
