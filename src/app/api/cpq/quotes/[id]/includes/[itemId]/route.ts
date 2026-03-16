/**
 * API Route: /api/cpq/quotes/[id]/includes/[itemId]
 * PUT    - Editar ítem (texto, orden, showInPdf)
 * DELETE - Eliminar ítem
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, ensureModuleAccess } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const updateItemSchema = z.object({
  text: z.string().min(1).max(500).optional(),
  sortOrder: z.number().int().min(0).optional(),
  showInPdf: z.boolean().optional(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const { id: quoteId, itemId } = await params;
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbiddenMod = await ensureModuleAccess(ctx, "cpq");
    if (forbiddenMod) return forbiddenMod;

    // Verify quote ownership
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

    // Verify item belongs to quote
    const existing = await prisma.cpqQuoteIncludesItem.findFirst({
      where: { id: itemId, quoteId },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Ítem no encontrado" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const parsed = updateItemSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || "Datos inválidos" },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (parsed.data.text !== undefined) updateData.text = parsed.data.text.trim();
    if (parsed.data.sortOrder !== undefined) updateData.sortOrder = parsed.data.sortOrder;
    if (parsed.data.showInPdf !== undefined) updateData.showInPdf = parsed.data.showInPdf;

    const item = await prisma.cpqQuoteIncludesItem.update({
      where: { id: itemId },
      data: updateData,
      include: { suggestion: { select: { id: true, text: true } } },
    });

    // Sync legacy field
    await syncIncludedItemsArray(quoteId);

    return NextResponse.json({ success: true, data: item });
  } catch (error) {
    console.error("Error updating quote includes item:", error);
    return NextResponse.json(
      { success: false, error: "Error al actualizar ítem" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const { id: quoteId, itemId } = await params;
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

    const existing = await prisma.cpqQuoteIncludesItem.findFirst({
      where: { id: itemId, quoteId },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Ítem no encontrado" },
        { status: 404 }
      );
    }

    await prisma.cpqQuoteIncludesItem.delete({ where: { id: itemId } });

    // Sync legacy field
    await syncIncludedItemsArray(quoteId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting quote includes item:", error);
    return NextResponse.json(
      { success: false, error: "Error al eliminar ítem" },
      { status: 500 }
    );
  }
}

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
