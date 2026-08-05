/**
 * Resumen de pipeline de negocios calculado en servidor.
 *
 * Conteos: groupBy sobre el universo filtrado completo.
 * Montos: solo etapas abiertas (isClosedWon=false && isClosedLost=false),
 * vía resolveDealActiveQuotationSummary. Etapas cerradas → clp/uf/guards null
 * (decisión de rendimiento; el monto se ve en la vista Tabla).
 */

import { prisma } from "@/lib/prisma";
import { getUfValue } from "@/lib/uf";
import {
  collectLinkedQuoteIds,
  resolveDealActiveQuotationSummary,
} from "@/lib/crm-deal-active-quotation";
import {
  buildDealListWhere,
  type DealsFocus,
  type ListDealsParams,
} from "@/lib/crm/list-deals";
import {
  dealProbability,
  type StageLike,
} from "@/lib/crm/deal-metrics";

export type PipelineStageTotals = {
  count: number;
  clp: number | null;
  uf: number | null;
  guards: number | null;
  weightedClp: number | null;
};

export type DealsPipelineSummary = {
  stages: Record<string, PipelineStageTotals>;
  open: {
    count: number;
    clp: number;
    uf: number;
    guards: number;
    weightedClp: number;
  };
  closedCounts: Record<string, number>;
  ufValue: number;
  computedAt: string;
};

export type GetDealsPipelineSummaryParams = {
  tenantId: string;
  focus?: DealsFocus;
  search?: string;
};

export async function getDealsPipelineSummary(
  params: GetDealsPipelineSummaryParams,
): Promise<DealsPipelineSummary> {
  const listParams: ListDealsParams = {
    tenantId: params.tenantId,
    focus: params.focus,
    search: params.search,
  };
  const where = await buildDealListWhere(listParams);

  const [stages, grouped, ufValue] = await Promise.all([
    prisma.crmPipelineStage.findMany({
      where: { tenantId: params.tenantId, isActive: true },
      orderBy: { order: "asc" },
      select: {
        id: true,
        order: true,
        isClosedWon: true,
        isClosedLost: true,
        isAccepted: true,
      },
    }),
    prisma.crmDeal.groupBy({
      by: ["stageId"],
      where,
      _count: { _all: true },
    }),
    getUfValue(),
  ]);

  const stageById = new Map(stages.map((s) => [s.id, s]));
  const openStages = stages.filter((s) => !s.isClosedWon && !s.isClosedLost);
  const openIds = new Set(openStages.map((s) => s.id));

  const stagesOut: Record<string, PipelineStageTotals> = {};
  const closedCounts: Record<string, number> = {};
  for (const s of stages) {
    stagesOut[s.id] = {
      count: 0,
      clp: openIds.has(s.id) ? 0 : null,
      uf: openIds.has(s.id) ? 0 : null,
      guards: openIds.has(s.id) ? 0 : null,
      weightedClp: openIds.has(s.id) ? 0 : null,
    };
  }

  let openCount = 0;
  for (const row of grouped) {
    const count = row._count._all;
    const bucket = stagesOut[row.stageId] ?? {
      count: 0,
      clp: null,
      uf: null,
      guards: null,
      weightedClp: null,
    };
    bucket.count = count;
    stagesOut[row.stageId] = bucket;
    if (openIds.has(row.stageId)) openCount += count;
    else closedCounts[row.stageId] = count;
  }

  const openDeals =
    openIds.size > 0
      ? await prisma.crmDeal.findMany({
          where: { ...where, stageId: { in: [...openIds] } },
          select: {
            id: true,
            stageId: true,
            probability: true,
            activeQuotationId: true,
            quotes: { select: { quoteId: true } },
          },
        })
      : [];

  const quoteIds = collectLinkedQuoteIds(openDeals);
  const linkedQuotes =
    quoteIds.length > 0
      ? await prisma.cpqQuote.findMany({
          where: { tenantId: params.tenantId, id: { in: quoteIds } },
          select: {
            id: true,
            code: true,
            status: true,
            currency: true,
            monthlyCost: true,
            totalGuards: true,
            createdAt: true,
            updatedAt: true,
            parameters: { select: { salePriceMonthly: true } },
          },
        })
      : [];
  const quoteById = new Map(linkedQuotes.map((q) => [q.id, q]));

  let openClp = 0;
  let openUf = 0;
  let openGuards = 0;
  let openWeighted = 0;

  for (const deal of openDeals) {
    const stage = stageById.get(deal.stageId) as StageLike | undefined;
    if (!stage) continue;
    const summary = resolveDealActiveQuotationSummary(deal, quoteById, ufValue);
    const clp = Number(summary?.amountClp ?? 0) || 0;
    const uf = Number(summary?.amountUf ?? 0) || 0;
    const guards = Number(summary?.totalGuards ?? 0) || 0;
    const weighted = Math.round(
      clp * dealProbability(deal, stage, openStages),
    );

    const bucket = stagesOut[deal.stageId];
    if (bucket && bucket.clp != null) {
      bucket.clp += clp;
      bucket.uf = (bucket.uf ?? 0) + uf;
      bucket.guards = (bucket.guards ?? 0) + guards;
      bucket.weightedClp = (bucket.weightedClp ?? 0) + weighted;
    }

    openClp += clp;
    openUf += uf;
    openGuards += guards;
    openWeighted += weighted;
  }

  return {
    stages: stagesOut,
    open: {
      count: openCount,
      clp: openClp,
      uf: openUf,
      guards: openGuards,
      weightedClp: openWeighted,
    },
    closedCounts,
    ufValue,
    computedAt: new Date().toISOString(),
  };
}
