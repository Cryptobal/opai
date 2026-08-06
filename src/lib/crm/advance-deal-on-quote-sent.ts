/**
 * Avanza un negocio a "Cotización enviada" al enviar una propuesta.
 *
 * Importante: siempre reabre el deal (`status: "open"`). Los flujos de envío
 * históricos solo actualizaban `stageId`, dejando negocios `lost`/`won` con
 * etapa abierta → la ficha mostraba "Perdido" y la lista "Cotización".
 */

import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

export async function advanceDealToQuoteSentStage(opts: {
  db: Db;
  tenantId: string;
  dealId: string;
  fromStageId: string;
  changedBy: string;
  /** Si se omite, busca la etapa activa "Cotización enviada". */
  targetStageId?: string | null;
}): Promise<{ moved: boolean; stageId: string | null }> {
  const { db, tenantId, dealId, fromStageId, changedBy } = opts;

  const targetStage = opts.targetStageId
    ? await db.crmPipelineStage.findFirst({
        where: { id: opts.targetStageId, tenantId, isActive: true },
        select: { id: true },
      })
    : await db.crmPipelineStage.findFirst({
        where: { tenantId, name: "Cotización enviada", isActive: true },
        select: { id: true },
      });

  if (!targetStage) {
    return { moved: false, stageId: null };
  }

  if (fromStageId === targetStage.id) {
    // Misma etapa, pero igual reabrir si quedó status inconsistente.
    await db.crmDeal.updateMany({
      where: { id: dealId, tenantId, status: { not: "open" } },
      data: { status: "open" },
    });
    return { moved: false, stageId: targetStage.id };
  }

  await db.crmDeal.updateMany({
    where: { id: dealId, tenantId },
    data: { stageId: targetStage.id, status: "open" },
  });

  await db.crmDealStageHistory.create({
    data: {
      tenantId,
      dealId,
      fromStageId,
      toStageId: targetStage.id,
      changedBy,
    },
  });

  return { moved: true, stageId: targetStage.id };
}

/**
 * Al enviar cotización: marca propuesta enviada, reabre el deal y asegura
 * contacto principal (necesario para que los follow-ups no fallen con
 * "Contacto sin email").
 */
export async function markDealProposalSent(opts: {
  db: Db;
  tenantId: string;
  dealId: string;
  data: {
    proposalSentAt?: Date;
    proposalLink?: string | null;
    amount?: number | Prisma.Decimal;
    totalPuestos?: number;
    primaryContactId?: string | null;
  };
}): Promise<void> {
  const { db, tenantId, dealId, data } = opts;
  const deal = await db.crmDeal.findFirst({
    where: { id: dealId, tenantId },
    select: { id: true, primaryContactId: true },
  });
  if (!deal) return;

  await db.crmDeal.updateMany({
    where: { id: dealId, tenantId },
    data: {
      status: "open",
      proposalSentAt: data.proposalSentAt ?? new Date(),
      ...(data.proposalLink !== undefined ? { proposalLink: data.proposalLink } : {}),
      ...(data.amount !== undefined ? { amount: data.amount } : {}),
      ...(data.totalPuestos !== undefined ? { totalPuestos: data.totalPuestos } : {}),
      ...(data.primaryContactId && !deal.primaryContactId
        ? { primaryContactId: data.primaryContactId }
        : {}),
    },
  });
}
