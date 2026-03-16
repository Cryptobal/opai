/**
 * API Route: /api/cpq/quotes/[id]/includes/reorder
 * PATCH - Reordenar ítems incluidos
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, ensureModuleAccess } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const reorderSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().uuid(),
      sortOrder: z.number().int().min(0),
    })
  ).min(1),
});

export async function PATCH(
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
    const parsed = reorderSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || "Datos inválidos" },
        { status: 400 }
      );
    }

    // Update all sort orders in a transaction
    await prisma.$transaction(
      parsed.data.items.map(({ id, sortOrder }) =>
        prisma.cpqQuoteIncludesItem.updateMany({
          where: { id, quoteId },
          data: { sortOrder },
        })
      )
    );

    // Sync legacy field
    const items = await prisma.cpqQuoteIncludesItem.findMany({
      where: { quoteId, showInPdf: true },
      orderBy: { sortOrder: "asc" },
      select: { text: true },
    });
    await prisma.cpqQuote.update({
      where: { id: quoteId },
      data: { includedItems: { set: items.map((i) => i.text) } },
    });

    // Return updated list
    const updatedItems = await prisma.cpqQuoteIncludesItem.findMany({
      where: { quoteId },
      orderBy: { sortOrder: "asc" },
      include: { suggestion: { select: { id: true, text: true } } },
    });

    return NextResponse.json({ success: true, data: updatedItems });
  } catch (error) {
    console.error("Error reordering quote includes:", error);
    return NextResponse.json(
      { success: false, error: "Error al reordenar ítems" },
      { status: 500 }
    );
  }
}
