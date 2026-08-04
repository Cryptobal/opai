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
import { requireTenantModule } from '@/lib/require-module';
import {
  listCrmQuotes,
  type QuoteStatusFilter,
  type QuoteListSort,
} from "@/lib/crm/list-quotes";
import { nextDocumentCode } from "@/lib/cpq/document-counter";

export async function GET(request: NextRequest) {
  try {
    const modCheck = await requireTenantModule('cpq');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCpqView(ctx);
    if (forbidden) return forbidden;
    const tenantId = ctx.tenantId;

    const sp = request.nextUrl.searchParams;
    const leadId = sp.get("leadId") || undefined;
    const dealId = sp.get("dealId") || undefined;
    const search = sp.get("search") || undefined;
    const statusRaw = sp.get("status");
    const status = (
      statusRaw === "all" || statusRaw === "draft" || statusRaw === "sent"
      || statusRaw === "approved" || statusRaw === "rejected"
        ? statusRaw
        : undefined
    ) as QuoteStatusFilter | undefined;
    const sortRaw = sp.get("sort");
    const sort = (
      sortRaw === "az" || sortRaw === "za" || sortRaw === "newest" || sortRaw === "oldest"
        ? sortRaw
        : undefined
    ) as QuoteListSort | undefined;
    const includeCounts = sp.get("includeCounts") === "true";
    const limitRaw = sp.get("limit") ?? sp.get("pageSize");
    const pageRaw = sp.get("page");
    const paginated = limitRaw != null || pageRaw != null;
    const listMode = sp.get("list") === "crm" || paginated || includeCounts;

    // Modo listado CRM paginado / enriquecido
    if (listMode) {
      const result = await listCrmQuotes({
        tenantId,
        leadId,
        dealId,
        search,
        status,
        sort,
        includeCounts: includeCounts || paginated,
        ...(paginated
          ? {
              page: pageRaw != null ? Number.parseInt(pageRaw, 10) : 1,
              pageSize: limitRaw != null ? Number.parseInt(limitRaw, 10) : undefined,
            }
          : {}),
      });
      if (!paginated) {
        return NextResponse.json({ success: true, data: result.quotes });
      }
      return NextResponse.json({
        success: true,
        data: result.quotes,
        meta: {
          page: result.page,
          pageSize: result.pageSize,
          total: result.total,
          hasMore: result.hasMore,
          counts: result.counts,
        },
      });
    }

    // Legacy: lead/deal scoped raw rows (sin paginar)
    const where: Record<string, unknown> = { tenantId };
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
    const modCheck = await requireTenantModule('cpq');
    if (!modCheck.authorized) return modCheck.response;

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

    const quote = await prisma.$transaction(async (tx) => {
      const code = await nextDocumentCode(tx, tenantId, "quote");
      return tx.cpqQuote.create({
        data: {
          tenantId,
          code,
          name,
          status: "draft",
          clientName,
          validUntil,
          notes,
          // Standard initial poliza amount for security-service contracts
          // (token {{quote.insurancePolicyUF}} in CUARTA/SÉPTIMA clauses).
          // Users can override in Commercial Conditions.
          insurancePolicyUF: 1500,
          ...(accountId ? { accountId } : {}),
          ...(dealId ? { dealId } : {}),
          ...(installationId ? { installationId } : {}),
        },
      });
    });

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
