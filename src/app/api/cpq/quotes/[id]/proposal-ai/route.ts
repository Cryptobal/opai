/**
 * API Route: /api/cpq/quotes/[id]/proposal-ai
 * POST - Invalida el contenido AI cacheado de la Propuesta Técnica para forzar
 *        su regeneración (usando la Descripción y el Detalle de servicio actuales)
 *        en la próxima generación/preview del PDF.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCpqEdit } from "@/lib/api-auth-cpq";
import { requireTenantModule } from "@/lib/require-module";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const modCheck = await requireTenantModule("cpq");
    if (!modCheck.authorized) return modCheck.response;

    const { id } = await params;
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCpqEdit(ctx);
    if (forbidden) return forbidden;

    const existing = await prisma.cpqQuote.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Quote not found" },
        { status: 404 }
      );
    }

    await prisma.cpqQuote.update({
      where: { id },
      data: { proposalAiContent: Prisma.DbNull, proposalAiGeneratedAt: null },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error invalidating proposal AI content:", error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { success: false, error: `Failed to reset proposal AI: ${msg}` },
      { status: 500 }
    );
  }
}
