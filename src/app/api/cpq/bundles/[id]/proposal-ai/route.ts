/**
 * API Route: /api/cpq/bundles/[id]/proposal-ai
 * POST - Invalida el contenido AI cacheado de la propuesta consolidada para
 *        forzar su regeneración en la próxima generación/preview del PDF.
 *        Espejo de /api/cpq/quotes/[id]/proposal-ai a nivel bundle.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireCpqEdit } from "@/lib/api-auth-cpq";
import { requireTenantModule } from "@/lib/require-module";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { createCrmHistoryLog } from "@/lib/crm-history";

export const runtime = "nodejs";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const modCheck = await requireTenantModule("cpq");
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCpqEdit(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;
    const existing = await prisma.cpqProposalBundle.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Propuesta no encontrada" },
        { status: 404 },
      );
    }

    await prisma.cpqProposalBundle.update({
      where: { id },
      data: { proposalAiContent: Prisma.DbNull },
    });

    await createCrmHistoryLog({
      tenantId: ctx.tenantId,
      entityType: "bundle",
      entityId: id,
      action: "bundle_proposal_ai_reset",
      createdBy: ctx.userId ?? null,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[cpq/bundles/proposal-ai]", error);
    return NextResponse.json(
      { success: false, error: "Error al reiniciar contenido IA" },
      { status: 500 },
    );
  }
}
