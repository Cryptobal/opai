/**
 * API Route: /api/cpq/quotes
 * GET  - Listar cotizaciones CPQ
 * POST - Crear cotización CPQ
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, ensureModuleAccess, ensureCanCreateQuote } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { createCrmHistoryLog } from "@/lib/crm-history";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbiddenMod = await ensureModuleAccess(ctx, "cpq");
    if (forbiddenMod) return forbiddenMod;
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

    // Auto-insert default includes
    try {
      const defaultSuggestions = await prisma.cpqIncludesSuggestion.findMany({
        where: {
          isDefault: true,
          isActive: true,
          OR: [{ tenantId: null }, { tenantId }],
        },
        orderBy: { sortOrder: "asc" },
      });

      if (defaultSuggestions.length > 0) {
        await prisma.cpqQuoteIncludesItem.createMany({
          data: defaultSuggestions.map((s, idx) => ({
            quoteId: quote!.id,
            text: s.text,
            sortOrder: idx,
            showInPdf: true,
            source: "suggestion",
            suggestionId: s.id,
          })),
        });

        // Sync legacy includedItems field
        await prisma.cpqQuote.update({
          where: { id: quote!.id },
          data: {
            includedItems: defaultSuggestions.map((s) => s.text),
          },
        });
      }
    } catch (err) {
      console.error("Error auto-inserting default includes:", err);
      // Non-blocking: quote was created successfully
    }

    return NextResponse.json({ success: true, data: quote }, { status: 201 });
  } catch (error) {
    console.error("Error creating CPQ quote:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo crear la cotización" },
      { status: 500 }
    );
  }
}
