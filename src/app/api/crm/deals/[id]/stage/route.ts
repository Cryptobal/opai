/**
 * API Route: /api/crm/deals/[id]/stage
 * POST - Cambiar etapa de negocio
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, parseBody } from "@/lib/api-auth";
import { requireCrmEdit } from "@/lib/api-auth-crm";
import { updateDealStageSchema } from "@/lib/validations/crm";
import { requireTenantModule } from '@/lib/require-module';
import {
  propagateDealWon,
  propagateDealLost,
  type DealLostPropagationResult,
} from "@/lib/crm/deal-propagation";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const modCheck = await requireTenantModule('crm');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await requireCrmEdit(ctx, "deals");
    if (forbidden) return forbidden;

    const { id } = await params;
    const parsed = await parseBody(request, updateDealStageSchema);
    if (parsed.error) return parsed.error;
    const { stageId, serviceStartDate } = parsed.data;

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

    // Validar que etapa aceptada requiere serviceStartDate
    if (stage.isAccepted && !serviceStartDate) {
      return NextResponse.json(
        { success: false, error: "La fecha de inicio es requerida para esta etapa" },
        { status: 400 }
      );
    }

    const nextStatus =
      stage.isClosedWon ? "won" : stage.isClosedLost ? "lost" : "open";
    const shouldSetProposalSentAt =
      stage.name === "Cotización enviada" &&
      nextStatus === "open" &&
      !deal.proposalSentAt;

    let dealLostResult: DealLostPropagationResult | null = null;

    const updatedDeal = await prisma.$transaction(async (tx) => {
      const updated = await tx.crmDeal.update({
        where: { id: deal.id },
        data: {
          stageId: stage.id,
          status: nextStatus,
          proposalSentAt: shouldSetProposalSentAt ? new Date() : undefined,
          serviceStartDate: stage.isAccepted && serviceStartDate
            ? new Date(serviceStartDate)
            : undefined,
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

      // Si se mueve a etapa de cierre (ganado/perdido) o Negociación, cancelar follow-ups pendientes
      const shouldCancelFollowUps = nextStatus === "won" || nextStatus === "lost" || stage.isAccepted || stage.name === "Negociación";
      if (shouldCancelFollowUps) {
        try {
          const { cancelPendingFollowUps } = await import("@/lib/followup-scheduler");
          await cancelPendingFollowUps(
            deal.id,
            nextStatus === "won"
              ? "Deal ganado"
              : nextStatus === "lost"
                ? "Deal perdido"
                : stage.isAccepted
                  ? "Deal adjudicado"
                  : `Etapa cambiada a ${stage.name}`
          );
        } catch (e) {
          console.error("Error cancelling follow-ups on deal close:", e);
        }
      }

      // Archive/unarchive linked presentations when deal closes/reopens
      const previousStage = await tx.crmPipelineStage.findUnique({
        where: { id: deal.stageId },
        select: { isClosedWon: true, isClosedLost: true },
      });
      const wasClosed = previousStage?.isClosedWon || previousStage?.isClosedLost;
      const isClosed = stage.isClosedWon || stage.isClosedLost;

      if (isClosed && !wasClosed) {
        // Deal just closed → archive linked presentations
        const linkedQuoteIds = await tx.crmDealQuote.findMany({
          where: { dealId: deal.id },
          select: { quoteId: true },
        });
        const directQuoteIds = await tx.cpqQuote.findMany({
          where: { dealId: deal.id },
          select: { id: true },
        });
        const allQuoteIds = [...new Set([
          ...linkedQuoteIds.map((q) => q.quoteId),
          ...directQuoteIds.map((q) => q.id),
        ])];
        if (allQuoteIds.length > 0) {
          await tx.presentation.updateMany({
            where: { quoteId: { in: allQuoteIds }, archivedAt: null },
            data: { archivedAt: new Date() },
          });
        }
      } else if (!isClosed && wasClosed) {
        // Deal reopened → unarchive linked presentations
        const linkedQuoteIds = await tx.crmDealQuote.findMany({
          where: { dealId: deal.id },
          select: { quoteId: true },
        });
        const directQuoteIds = await tx.cpqQuote.findMany({
          where: { dealId: deal.id },
          select: { id: true },
        });
        const allQuoteIds = [...new Set([
          ...linkedQuoteIds.map((q) => q.quoteId),
          ...directQuoteIds.map((q) => q.id),
        ])];
        if (allQuoteIds.length > 0) {
          await tx.presentation.updateMany({
            where: { quoteId: { in: allQuoteIds }, archivedAt: { not: null } },
            data: { archivedAt: null },
          });
        }
      }

      // Si el negocio fue ganado, transición portal: prospect → client_active
      // (La notificación de contrato pendiente se envía FUERA de la transacción
      // para respetar las preferencias de usuario vía notify()).
      if (nextStatus === "won" && updated.account.status === "prospect") {
        try {
          await tx.crmAccount.update({
            where: { id: updated.accountId },
            data: {
              status: "client_active",
              portalTourShown: false, // reset tour for active mode
            },
          });
        } catch (e) {
          console.error("Error transitioning portal prospect to active:", e);
        }
      }

      // Propagación Deal ↔ Quote ↔ Installation
      if (nextStatus === "won") {
        try {
          await propagateDealWon(tx, ctx.tenantId, deal.id);
        } catch (e) {
          console.error("Error propagating deal won state:", e);
        }
      } else if (nextStatus === "lost") {
        try {
          dealLostResult = await propagateDealLost(tx, ctx.tenantId, deal.id);
        } catch (e) {
          console.error("Error propagating deal lost state:", e);
        }
      }

      return updated;
    });

    // Notificación de contrato pendiente — fuera de la transacción para que
    // respete las preferencias por usuario (bell/email) y no bloquee el commit
    // si el envío de email falla.
    if (nextStatus === "won") {
      try {
        const { notify } = await import("@/lib/notifications/notify");
        await notify({
          tenantId: ctx.tenantId,
          type: "contract_required",
          audience: "admin",
          title: `Contrato pendiente: ${updatedDeal.account.name}`,
          body: `El negocio "${updatedDeal.title}" fue ganado. Se requiere generar un contrato.`,
          data: {
            dealId: updatedDeal.id,
            accountId: updatedDeal.accountId,
            accountName: updatedDeal.account.name,
            dealTitle: updatedDeal.title,
          },
          link: `/opai/documentos/nuevo?accountId=${updatedDeal.accountId}&dealId=${updatedDeal.id}`,
        });
      } catch (e) {
        console.error("Error sending contract_required notification:", e);
      }
    }

    // Onboarding del cliente: si el deal pasó a won, asegurar el playbook
    // default del tenant y reportar si requiere onboarding (no creado aún).
    let onboardingMeta:
      | { requiresOnboarding: true; defaultPlaybookId: string }
      | { existingOnboarding: { id: string; status: string } }
      | null = null;
    if (nextStatus === "won") {
      try {
        const { ensureDefaultPlaybook } = await import(
          "@/lib/onboarding/seed-defaults"
        );
        const seed = await ensureDefaultPlaybook(ctx.tenantId);
        const existing = await prisma.clientOnboarding.findUnique({
          where: { dealId: updatedDeal.id },
          select: { id: true, status: true },
        });
        if (existing) {
          onboardingMeta = { existingOnboarding: existing };
        } else {
          onboardingMeta = {
            requiresOnboarding: true,
            defaultPlaybookId: seed.playbookId,
          };
        }
      } catch (e) {
        console.error("[onboarding] ensure on deal won failed:", e);
      }
    }

    return NextResponse.json({
      success: true,
      data: updatedDeal,
      ...(onboardingMeta ?? {}),
      deactivationCandidate:
        (dealLostResult as DealLostPropagationResult | null)?.deactivationCandidate ?? null,
    });
  } catch (error) {
    console.error("Error updating CRM deal stage:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update deal stage" },
      { status: 500 }
    );
  }
}
