/**
 * API Route: /api/cpq/quotes/[id]/includes
 * GET  - Lista ítems incluidos de una cotización
 * POST - Agregar ítem (desde sugerencia o custom)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, ensureModuleAccess } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const createItemSchema = z.object({
  text: z.string().min(1, "El texto es requerido").max(500),
  source: z.enum(["suggestion", "custom"]).default("custom"),
  suggestionId: z.string().uuid().optional().nullable(),
  showInPdf: z.boolean().default(true),
  sortOrder: z.number().int().min(0).optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: quoteId } = await params;
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbiddenMod = await ensureModuleAccess(ctx, "cpq");
    if (forbiddenMod) return forbiddenMod;

    const quote = await prisma.cpqQuote.findFirst({
      where: { id: quoteId, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!quote) {
      return NextResponse.json(
        { success: false, error: "Cotización no encontrada" },
        { status: 404 }
      );
    }

    const items = await prisma.cpqQuoteIncludesItem.findMany({
      where: { quoteId },
      orderBy: { sortOrder: "asc" },
      include: { suggestion: { select: { id: true, text: true } } },
    });

    return NextResponse.json({ success: true, data: items });
  } catch (error) {
    console.error("Error fetching quote includes:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener ítems incluidos" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: quoteId } = await params;
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbiddenMod = await ensureModuleAccess(ctx, "cpq");
    if (forbiddenMod) return forbiddenMod;

    const quote = await prisma.cpqQuote.findFirst({
      where: { id: quoteId, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!quote) {
      return NextResponse.json(
        { success: false, error: "Cotización no encontrada" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const parsed = createItemSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || "Datos inválidos" },
        { status: 400 }
      );
    }

    const { text, source, suggestionId, showInPdf, sortOrder } = parsed.data;

    // If no sortOrder specified, put it at the end
    let finalSortOrder = sortOrder;
    if (finalSortOrder === undefined) {
      const lastItem = await prisma.cpqQuoteIncludesItem.findFirst({
        where: { quoteId },
        orderBy: { sortOrder: "desc" },
        select: { sortOrder: true },
      });
      finalSortOrder = (lastItem?.sortOrder ?? -1) + 1;
    }

    const item = await prisma.cpqQuoteIncludesItem.create({
      data: {
        quoteId,
        text: text.trim(),
        source,
        suggestionId: suggestionId || null,
        showInPdf,
        sortOrder: finalSortOrder,
      },
      include: { suggestion: { select: { id: true, text: true } } },
    });

    // Sync includedItems array on quote for backward compatibility
    await syncIncludedItemsArray(quoteId);

    return NextResponse.json({ success: true, data: item }, { status: 201 });
  } catch (error) {
    console.error("Error creating quote includes item:", error);
    return NextResponse.json(
      { success: false, error: "Error al agregar ítem" },
      { status: 500 }
    );
  }
}

/** Sync the legacy includedItems string[] field on the quote */
async function syncIncludedItemsArray(quoteId: string) {
  const items = await prisma.cpqQuoteIncludesItem.findMany({
    where: { quoteId, showInPdf: true },
    orderBy: { sortOrder: "asc" },
    select: { text: true },
  });
  await prisma.cpqQuote.update({
    where: { id: quoteId },
    data: { includedItems: { set: items.map((i) => i.text) } },
  });
}
