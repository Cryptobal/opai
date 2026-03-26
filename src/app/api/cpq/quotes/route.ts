/**
 * API Route: /api/cpq/quotes
 * GET  - Listar cotizaciones CPQ
 * POST - Crear cotización CPQ
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, ensureCanCreateQuote } from "@/lib/api-auth";
import { requireCpqView, requireCpqEdit } from "@/lib/api-auth-cpq";
import { prisma } from "@/lib/prisma";
import { createCrmHistoryLog } from "@/lib/crm-history";
import { applyDefaultQuoteIncludes } from "@/lib/cpq/apply-default-quote-includes";
import { computeCpqQuoteCosts } from "@/modules/cpq/costing/compute-quote-costs";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCpqView(ctx);
    if (forbidden) return forbidden;
    const tenantId = ctx.tenantId;

    const { searchParams } = new URL(request.url);
    const leadId = searchParams.get("leadId");
    const dealId = searchParams.get("dealId");

    const where: any = { tenantId };
    if (leadId) where.createdFromLeadId = leadId;
    if (dealId) where.dealId = dealId;

    const quotes = await prisma.cpqQuote.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: leadId ? { installation: { select: { id: true, name: true } } } : undefined,
    });

    return NextResponse.json({ success: true, data: quotes });
  } catch (error) {
    console.error("Error fetching CPQ quotes:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch quotes" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbiddenCreate = await ensureCanCreateQuote(ctx);
    if (forbiddenCreate) return forbiddenCreate;
    const tenantId = ctx.tenantId;
    const body = await request.json();

    const name = body?.name?.trim() || null;
    const clientName = body?.clientName?.trim() || null;
    const validUntil = body?.validUntil
      ? new Date(body.validUntil)
      : (() => {
          const d = new Date();
          d.setDate(d.getDate() + 90);
          return d;
        })();
    const notes = body?.notes?.trim() || null;
    const accountId = body?.accountId?.trim() || null;
    const dealId = body?.dealId?.trim() || null;
    const installationId = body?.installationId?.trim() || null;

    if (dealId) {
      const dealExists = await prisma.crmDeal.findFirst({
        where: { id: dealId, tenantId },
        select: { id: true },
      });
      if (!dealExists) {
        return NextResponse.json(
          { success: false, error: "Negocio no encontrado" },
          { status: 400 }
        );
      }
    }

    // Generar código único con retry para evitar race condition
    const year = new Date().getFullYear();
    let quote = null;
    let attempts = 0;
    const maxAttempts = 10;

    while (!quote && attempts < maxAttempts) {
      attempts++;
      const count = await prisma.cpqQuote.count({ where: { tenantId } });
      const code = `CPQ-${year}-${String(count + attempts).padStart(3, "0")}`;

      try {
        quote = await prisma.cpqQuote.create({
          data: {
            tenantId,
            code,
            name,
            status: "draft",
            clientName,
            validUntil,
            notes,
            ...(accountId ? { accountId } : {}),
            ...(dealId ? { dealId } : {}),
            ...(installationId ? { installationId } : {}),
          },
        });
      } catch (err: any) {
        // Si es error de código duplicado, reintentar
        if (err.code === 'P2002' && attempts < maxAttempts) {
          continue;
        }
        throw err;
      }
    }

    if (!quote) {
      throw new Error('No se pudo generar código único después de múltiples intentos');
    }

    await createCrmHistoryLog({
      tenantId: ctx.tenantId,
      entityType: "quote",
      entityId: quote.id,
      action: "quote_created",
      details: { code: quote.code, clientName: quote.clientName ?? null },
      createdBy: ctx.userId,
    });

    try {
      await applyDefaultQuoteIncludes(prisma, quote.id, tenantId);
    } catch (err) {
      console.error("Error auto-inserting default includes:", err);
    }

    let dealQuoteLink: { id: string; quoteId: string } | null = null;
    if (dealId) {
      try {
        dealQuoteLink = await prisma.crmDealQuote.create({
          data: {
            tenantId,
            dealId,
            quoteId: quote.id,
          },
          select: { id: true, quoteId: true },
        });
      } catch (linkErr: unknown) {
        const code =
          linkErr && typeof linkErr === "object" && "code" in linkErr
            ? (linkErr as { code: string }).code
            : "";
        if (code === "P2002") {
          dealQuoteLink = await prisma.crmDealQuote.findFirst({
            where: { tenantId, dealId, quoteId: quote.id },
            select: { id: true, quoteId: true },
          });
        } else {
          console.error("Error linking quote to deal:", linkErr);
        }
      }
      if (dealQuoteLink) {
        try {
          const costs = await computeCpqQuoteCosts(quote.id);
          if (costs.monthlyTotal > 0) {
            await prisma.crmDeal.update({
              where: { id: dealId },
              data: {
                amount: costs.monthlyTotal,
                totalPuestos: costs.totalGuards,
              },
            });
          }
        } catch (amountError) {
          console.error("Error syncing deal amount from new quote:", amountError);
        }
      }
    }

    return NextResponse.json(
      { success: true, data: quote, dealQuoteLink },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating CPQ quote:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo crear la cotización" },
      { status: 500 }
    );
  }
}
