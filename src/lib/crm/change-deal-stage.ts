/**
 * Servicio de cambio de etapa de negocio (Fase 15, B4).
 *
 * EXTRAÍDO MECÁNICAMENTE de `POST /api/crm/deals/[id]/stage` (cero cambios de
 * comportamiento) para reusarlo desde el pipeline de Slack. El route delega acá
 * y mapea el resultado discriminado a su MISMA respuesta HTTP. Además emite el
 * evento `deal_won` al ganar (antes inexistente) — dispara la 🎉 al canal.
 */

import { prisma } from "@/lib/prisma";
import {
  propagateDealWon,
  propagateDealLost,
  type DealLostPropagationResult,
} from "@/lib/crm/deal-propagation";

type OnboardingMeta =
  | { requiresOnboarding: true; defaultPlaybookId: string; accountId: string; accountName: string }
  | { existingOnboarding: { id: string; accountId: string; accountName: string; status: string } }
  | null;

export type ChangeDealStageResult =
  | { kind: "deal_not_found" }
  | { kind: "stage_not_found" }
  | { kind: "needs_start_date" }
  | { kind: "error" }
  | { kind: "ok"; data: any; onboardingMeta: OnboardingMeta; deactivationCandidate: unknown };

const clp = (n: number) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(Math.round(n));

export async function changeDealStage(input: {
  tenantId: string;
  userId: string;
  dealId: string;
  stageId: string;
  serviceStartDate?: string | null;
}): Promise<ChangeDealStageResult> {
  const ctx = { tenantId: input.tenantId, userId: input.userId };
  const id = input.dealId;
  const { stageId, serviceStartDate } = input;
  try {
    const [deal, stage] = await Promise.all([
      prisma.crmDeal.findFirst({ where: { id, tenantId: ctx.tenantId } }),
      prisma.crmPipelineStage.findFirst({ where: { id: stageId, tenantId: ctx.tenantId } }),
    ]);

    if (!deal) {
      return { kind: "deal_not_found" };
    }

    if (!stage) {
      return { kind: "stage_not_found" };
    }

    // Validar que etapa aceptada requiere serviceStartDate
    if (stage.isAccepted && !serviceStartDate) {
      return { kind: "needs_start_date" };
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

    // Onboarding del cliente: si el deal pasó a won, asegurar el playbook
    // default del tenant y reportar si requiere onboarding (no creado aún)
    // o si ya existe (para que el frontend pueda navegar al hub).
    //
    // La notificación legacy `contract_required` se elimina porque el T1 del
    // playbook de onboarding (paso "Contrato cliente firmado") ya cubre ese
    // flujo de manera más robusta y trazable.
    let onboardingMeta:
      | {
          requiresOnboarding: true;
          defaultPlaybookId: string;
          accountId: string;
          accountName: string;
        }
      | {
          existingOnboarding: {
            id: string;
            accountId: string;
            accountName: string;
            status: string;
          };
        }
      | null = null;
    // Flag por tenant (default OFF): si el onboarding-al-ganar está apagado, no
    // se crea playbook ni onboardingMeta → el frontend no abre el modal (maneja
    // null). No afecta la 🎉 deal_won, propagateDealWon ni la transición portal.
    let onWonEnabled = false;
    if (nextStatus === "won") {
      try {
        const { getOnboardingConfig } = await import("@/lib/onboarding/config");
        onWonEnabled = (await getOnboardingConfig(ctx.tenantId)).onWonEnabled;
      } catch (e) {
        console.error("[onboarding] read on_won flag failed:", e);
      }
    }
    if (nextStatus === "won" && onWonEnabled) {
      try {
        const { ensureDefaultPlaybook } = await import(
          "@/lib/onboarding/seed-defaults"
        );
        const seed = await ensureDefaultPlaybook(ctx.tenantId);
        const existing = await prisma.clientOnboarding.findUnique({
          where: { dealId: updatedDeal.id },
          select: { id: true, status: true, accountId: true },
        });
        if (existing) {
          onboardingMeta = {
            existingOnboarding: {
              id: existing.id,
              accountId: existing.accountId,
              accountName: updatedDeal.account.name,
              status: existing.status,
            },
          };
        } else {
          onboardingMeta = {
            requiresOnboarding: true,
            defaultPlaybookId: seed.playbookId,
            accountId: updatedDeal.accountId,
            accountName: updatedDeal.account.name,
          };
        }
      } catch (e) {
        console.error("[onboarding] ensure on deal won failed:", e);
      }
    }

    // 🎉 Negocio ganado (Fase 15): evento deal_won → tarjeta celebratoria al canal.
    if (nextStatus === "won") {
      try {
        const monto = Number(updatedDeal.amount) || 0;
        const { notify } = await import("@/lib/notifications/notify");
        await notify({
          tenantId: ctx.tenantId,
          type: "deal_won",
          title: `🎉 Negocio ganado: ${updatedDeal.account.name}`,
          body: monto ? `💰 ${clp(monto)}` : undefined,
          link: `/crm/deals/${updatedDeal.id}`,
          data: { dealId: updatedDeal.id, empresa: updatedDeal.account.name, montoTxt: monto ? clp(monto) : undefined },
        });
      } catch (e) {
        console.error("[crm] deal_won notify failed:", e);
      }
    }

    // Fase 16 — Deal Rooms: todo cambio de etapa fluye a la sala del negocio.
    // `deal_stage_changed` (movimientos vivos) enruta a la sala y refresca la
    // ficha viva; `deal_lost` dispara el post-mortem (B5). El evento ganado ya
    // manda su propia tarjeta 🎉, así que no duplicamos con stage_changed.
    // Emitidos fuera de la transacción (como deal_won).
    try {
      const monto = Number(updatedDeal.amount) || 0;
      const montoTxt = monto ? clp(monto) : undefined;
      const { notify } = await import("@/lib/notifications/notify");
      if (nextStatus === "lost") {
        await notify({
          tenantId: ctx.tenantId,
          type: "deal_lost",
          title: `💔 Negocio perdido: ${updatedDeal.account.name}`,
          link: `/crm/deals/${updatedDeal.id}`,
          data: { dealId: updatedDeal.id, empresa: updatedDeal.account.name, etapa: stage.name, montoTxt },
        });
      } else if (nextStatus === "open") {
        await notify({
          tenantId: ctx.tenantId,
          type: "deal_stage_changed",
          title: `⏩ ${updatedDeal.account.name} → ${stage.name}`,
          body: montoTxt ? `💰 ${montoTxt}` : undefined,
          link: `/crm/deals/${updatedDeal.id}`,
          data: { dealId: updatedDeal.id, empresa: updatedDeal.account.name, etapa: stage.name, montoTxt },
        });
      }
    } catch (e) {
      console.error("[crm] deal_stage_changed/lost notify failed:", e);
    }

    // Auto-apertura por umbral (default OFF): no-op inmediato si el tenant no lo
    // activó. Solo en movimientos vivos (no en cierre won/lost).
    if (nextStatus === "open") {
      try {
        const { maybeAutoOpenDealRoom } = await import("@/lib/integrations/slack/deal-rooms/room");
        await maybeAutoOpenDealRoom(ctx.tenantId, updatedDeal.id, ctx.userId);
        // Sincroniza etapa → sala (ficha + topic + naming). No-op si no hay sala.
        const { syncDealRoomStage } = await import("@/lib/integrations/slack/deal-rooms/stage-sync");
        await syncDealRoomStage(ctx.tenantId, updatedDeal.id);
      } catch (e) {
        console.error("[slack] auto-open/sync deal room failed:", e);
      }
    }

    return { kind: "ok", data: updatedDeal, onboardingMeta, deactivationCandidate: (dealLostResult as DealLostPropagationResult | null)?.deactivationCandidate ?? null };
  } catch (error) {
    console.error("Error updating CRM deal stage:", error);
    return { kind: "error" };
  }
}
