/**
 * Marca una cotización como enviada en el flujo de licitación (sin portal).
 *
 * Caso: bases Wherex / Mercado Público / etc. — no se envía por portal ni
 * correo; al "enviar" la propuesta el negocio pasa a Negociación.
 */

import { prisma } from "@/lib/prisma";
import { computeCpqQuoteCosts } from "@/modules/cpq/costing/compute-quote-costs";
import {
  advanceDealToQuoteSentStage,
  markDealProposalSent,
} from "@/lib/crm/advance-deal-on-quote-sent";
import { syncLeadOnProposalSent } from "@/lib/crm/sync-lead-on-proposal-sent";
import { syncContractItemForQuote } from "@/modules/finance/cashflow/generators/sales-contract-sync";

/** Nombres canónicos y alias legacy (Soho) de la etapa de negociación. */
const NEGOTIATION_STAGE_NAMES = ["Negociación", "Negociando"] as const;

export class MarkQuoteSentLicitacionError extends Error {
  constructor(
    message: string,
    public readonly status: number = 400,
  ) {
    super(message);
    this.name = "MarkQuoteSentLicitacionError";
  }
}

export type MarkQuoteSentLicitacionResult = {
  quote: {
    id: string;
    status: string;
    code: string | null;
    name: string | null;
    dealId: string | null;
    visibleInClientPortal: boolean | null;
  };
  stageMoved: boolean;
  stageId: string | null;
  stageName: string | null;
};

async function findNegotiationStage(tenantId: string) {
  for (const name of NEGOTIATION_STAGE_NAMES) {
    const stage = await prisma.crmPipelineStage.findFirst({
      where: { tenantId, name, isActive: true },
      select: { id: true, name: true },
    });
    if (stage) return stage;
  }
  return null;
}

export async function markQuoteSentLicitacion(opts: {
  quoteId: string;
  tenantId: string;
  userId: string;
}): Promise<MarkQuoteSentLicitacionResult> {
  const { quoteId, tenantId, userId } = opts;

  const quote = await prisma.cpqQuote.findFirst({
    where: { id: quoteId, tenantId },
    include: {
      positions: { select: { id: true, numGuards: true, numPuestos: true } },
      additionalLines: { select: { id: true }, take: 1 },
    },
  });

  if (!quote) {
    throw new MarkQuoteSentLicitacionError("Cotización no encontrada", 404);
  }
  if (quote.status === "sent") {
    throw new MarkQuoteSentLicitacionError("La cotización ya está marcada como enviada");
  }
  if (quote.status !== "draft") {
    throw new MarkQuoteSentLicitacionError(
      `Solo se pueden marcar cotizaciones en borrador (estado actual: ${quote.status})`,
    );
  }
  if (!quote.dealId) {
    throw new MarkQuoteSentLicitacionError("La cotización debe tener un negocio asignado");
  }
  if (!quote.accountId) {
    throw new MarkQuoteSentLicitacionError("La cotización debe tener una cuenta asignada");
  }
  if (quote.positions.length === 0 && quote.additionalLines.length === 0) {
    throw new MarkQuoteSentLicitacionError(
      "Agrega puestos o líneas adicionales antes de marcar como enviada",
    );
  }

  const deal = await prisma.crmDeal.findFirst({
    where: { id: quote.dealId, tenantId },
    select: { id: true, stageId: true, isLicitacion: true },
  });
  if (!deal) {
    throw new MarkQuoteSentLicitacionError("Negocio no encontrado", 404);
  }
  if (!deal.isLicitacion) {
    throw new MarkQuoteSentLicitacionError(
      "Solo aplica a negocios marcados como licitación. Activalo en la ficha del negocio.",
    );
  }

  const negotiationStage = await findNegotiationStage(tenantId);
  if (!negotiationStage) {
    throw new MarkQuoteSentLicitacionError(
      'No hay una etapa activa "Negociación" en el pipeline. Créala en CRM → Configuración.',
      422,
    );
  }

  let monthlyTotal = Number(quote.monthlyCost) || 0;
  try {
    const costs = await computeCpqQuoteCosts(quoteId);
    monthlyTotal = costs.monthlyTotal;
  } catch (err) {
    console.warn("[CPQ] mark-sent-licitacion: compute costs failed, using monthlyCost", err);
  }

  const totalPuestos = quote.positions.reduce(
    (s, p) => s + p.numGuards * (p.numPuestos || 1),
    0,
  );

  await prisma.cpqQuote.updateMany({
    where: { id: quoteId, tenantId },
    data: { status: "sent" },
  });

  await markDealProposalSent({
    db: prisma,
    tenantId,
    dealId: deal.id,
    data: {
      proposalSentAt: new Date(),
      amount: monthlyTotal,
      totalPuestos,
      primaryContactId: quote.contactId,
    },
  });

  const advanced = await advanceDealToQuoteSentStage({
    db: prisma,
    tenantId,
    dealId: deal.id,
    fromStageId: deal.stageId,
    changedBy: userId,
    targetStageId: negotiationStage.id,
  });

  await prisma.crmHistoryLog.create({
    data: {
      tenantId,
      entityType: "quote",
      entityId: quoteId,
      action: "quote_sent_licitacion",
      details: {
        quoteCode: quote.code,
        dealId: deal.id,
        stageId: advanced.stageId,
        stageName: negotiationStage.name,
        stageMoved: advanced.moved,
        method: "licitacion_manual",
      },
      createdBy: userId,
    },
  });

  try {
    await syncLeadOnProposalSent({
      tenantId,
      actingUserId: userId,
      dealId: quote.dealId,
      accountId: quote.accountId,
      contactId: quote.contactId,
      createdFromLeadId: quote.createdFromLeadId,
      installationId: quote.installationId,
    });
  } catch (err) {
    console.error("[CPQ] mark-sent-licitacion: sync lead failed:", err);
  }

  try {
    await syncContractItemForQuote(tenantId, quoteId);
  } catch (err) {
    console.error("[CPQ] mark-sent-licitacion: sync cashflow failed:", err);
  }

  const updated = await prisma.cpqQuote.findFirst({
    where: { id: quoteId, tenantId },
    select: {
      id: true,
      status: true,
      code: true,
      name: true,
      dealId: true,
      visibleInClientPortal: true,
    },
  });

  if (!updated) {
    throw new MarkQuoteSentLicitacionError("Cotización no encontrada tras actualizar", 500);
  }

  return {
    quote: updated,
    stageMoved: advanced.moved,
    stageId: advanced.stageId,
    stageName: negotiationStage.name,
  };
}
