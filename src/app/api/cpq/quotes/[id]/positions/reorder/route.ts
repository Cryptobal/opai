/**
 * API Route: /api/cpq/quotes/[id]/positions/reorder
 * PATCH - Reordena los turnos (positions) de una cotización por displayOrder.
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
      }),
    )
    .min(1),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
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
        { status: 404 },
      );
    }

    const body = await request.json();
    const parsed = reorderSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || "Datos inválidos" },
        { status: 400 },
      );
    }

    await prisma.$transaction(
      parsed.data.items.map(({ id, displayOrder }) =>
        prisma.cpqPosition.updateMany({
          where: { id, quoteId },
          data: { displayOrder },
        }),
      ),
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error reordering CPQ positions:", error);
    return NextResponse.json(
      { success: false, error: "Error al reordenar turnos" },
      { status: 500 },
    );
  }
}
