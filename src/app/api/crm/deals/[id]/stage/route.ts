/**
 * API Route: /api/crm/deals/[id]/stage
 * POST - Cambiar etapa de negocio
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDefaultTenantId } from "@/lib/tenant";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth();
    const tenantId = session?.user?.tenantId ?? (await getDefaultTenantId());
    const userId = session?.user?.id || null;
    const body = await request.json();
    const stageId = body?.stageId;

    if (!stageId) {
      return NextResponse.json(
        { success: false, error: "stageId es requerido" },
        { status: 400 }
      );
    }

    const [deal, stage] = await Promise.all([
      prisma.crmDeal.findFirst({ where: { id, tenantId } }),
      prisma.crmPipelineStage.findFirst({ where: { id: stageId, tenantId } }),
    ]);

    if (!deal) {
      return NextResponse.json(
        { success: false, error: "Negocio no encontrado" },
        { status: 404 }
      );
    }

    if (!stage) {
      return NextResponse.json(
        { success: false, error: "Etapa no encontrada" },
        { status: 404 }
      );
    }

    const nextStatus =
      stage.isClosedWon ? "won" : stage.isClosedLost ? "lost" : "open";

    const updatedDeal = await prisma.$transaction(async (tx) => {
      const updated = await tx.crmDeal.update({
        where: { id: deal.id },
        data: {
          stageId: stage.id,
          status: nextStatus,
        },
        include: {
          account: true,
          stage: true,
          primaryContact: true,
        },
      });

      await tx.crmDealStageHistory.create({
        data: {
          tenantId,
          dealId: deal.id,
          fromStageId: deal.stageId,
          toStageId: stage.id,
          changedBy: userId,
        },
      });

      await tx.crmHistoryLog.create({
        data: {
          tenantId,
          entityType: "deal",
          entityId: deal.id,
          action: "deal_stage_changed",
          details: {
            fromStageId: deal.stageId,
            toStageId: stage.id,
          },
          createdBy: userId,
        },
      });

      return updated;
    });

    return NextResponse.json({ success: true, data: updatedDeal });
  } catch (error) {
    console.error("Error updating CRM deal stage:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update deal stage" },
      { status: 500 }
    );
  }
}
