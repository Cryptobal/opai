/**
 * API Route: /api/crm/deals/[id]/stage
 * POST - Cambiar etapa de negocio
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, parseBody } from "@/lib/api-auth";
import { updateDealStageSchema } from "@/lib/validations/crm";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const { id } = await params;
    const parsed = await parseBody(request, updateDealStageSchema);
    if (parsed.error) return parsed.error;
    const { stageId } = parsed.data;

    const [deal, stage] = await Promise.all([
      prisma.crmDeal.findFirst({ where: { id, tenantId: ctx.tenantId } }),
      prisma.crmPipelineStage.findFirst({ where: { id: stageId, tenantId: ctx.tenantId } }),
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
          account: {
            select: {
              id: true,
              name: true,
              type: true,
              status: true,
            },
          },
          stage: true,
          primaryContact: true,
        },
      });

      await tx.crmDealStageHistory.create({
        data: {
          tenantId: ctx.tenantId,
          dealId: deal.id,
          fromStageId: deal.stageId,
          toStageId: stage.id,
          changedBy: ctx.userId,
        },
      });

      await tx.crmHistoryLog.create({
        data: {
          tenantId: ctx.tenantId,
          entityType: "deal",
          entityId: deal.id,
          action: "deal_stage_changed",
          details: {
            fromStageId: deal.stageId,
            toStageId: stage.id,
          },
          createdBy: ctx.userId,
        },
      });

      // Si se mueve a "Cotización enviada" y no hay follow-ups pendientes, programarlos
      if (stage.name === "Cotización enviada" && nextStatus === "open") {
        try {
          const existingPending = await tx.crmFollowUpLog.count({
            where: { dealId: deal.id, status: { in: ["pending", "sent"] } },
          });
          if (existingPending === 0) {
            const { scheduleFollowUps } = await import("@/lib/followup-scheduler");
            const proposalDate = deal.proposalSentAt ?? new Date();
            await scheduleFollowUps({ tenantId: ctx.tenantId, dealId: deal.id, proposalDate });
          }
        } catch (e) {
          console.error("Error scheduling follow-ups on stage change:", e);
        }
      }

      // Si se mueve a etapa de cierre (ganado/perdido), cancelar follow-ups pendientes
      if (nextStatus === "won" || nextStatus === "lost") {
        try {
          const { cancelPendingFollowUps } = await import("@/lib/followup-scheduler");
          await cancelPendingFollowUps(deal.id, `Deal ${nextStatus === "won" ? "ganado" : "perdido"}`);
        } catch (e) {
          console.error("Error cancelling follow-ups on deal close:", e);
        }
      }

      // Si el negocio fue ganado, crear notificación de contrato pendiente
      if (nextStatus === "won") {
        await tx.notification.create({
          data: {
            tenantId: ctx.tenantId,
            type: "contract_required",
            title: `Contrato pendiente: ${updated.account.name}`,
            message: `El negocio "${updated.title}" fue ganado. Se requiere generar un contrato.`,
            data: {
              dealId: deal.id,
              accountId: updated.accountId,
              accountName: updated.account.name,
              dealTitle: updated.title,
            },
            link: `/opai/documentos/nuevo?accountId=${updated.accountId}&dealId=${deal.id}`,
          },
        });
      }

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
