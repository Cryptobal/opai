/**
 * API Route: /api/cpq/quotes/[id]/services/reorder
 * PATCH - Reordena los servicios (grupos) de una cotización por displayOrder.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCpqEdit } from "@/lib/api-auth-cpq";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { requireTenantModule } from "@/lib/require-module";

const reorderSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().uuid(),
        displayOrder: z.number().int().min(0),
      })
    )
    .min(1),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const modCheck = await requireTenantModule("cpq");
    if (!modCheck.authorized) return modCheck.response;

    const { id: quoteId } = await params;
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCpqEdit(ctx);
    if (forbidden) return forbidden;

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

    await prisma.$transaction(
      parsed.data.items.map(({ id, displayOrder }) =>
        prisma.cpqServiceGroup.updateMany({
          where: { id, quoteId, tenantId: ctx.tenantId },
          data: { displayOrder },
        })
      )
    );

    const updated = await prisma.cpqServiceGroup.findMany({
      where: { quoteId, tenantId: ctx.tenantId },
      orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("Error reordering CPQ service groups:", error);
    return NextResponse.json(
      { success: false, error: "Error al reordenar servicios" },
      { status: 500 }
    );
  }
}
