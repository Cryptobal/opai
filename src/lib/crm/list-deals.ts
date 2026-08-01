/**
 * Listado paginado de negocios CRM con resumen de cotización activa.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUfValue } from "@/lib/uf";
import {
  collectLinkedQuoteIds,
  resolveDealActiveQuotationSummary,
} from "@/lib/crm-deal-active-quotation";
import {
  DEAL_LIST_DEFAULT_PAGE_SIZE,
  DEAL_LIST_KANBAN_PAGE_SIZE,
} from "@/lib/crm/list-page-sizes";

export {
  DEAL_LIST_DEFAULT_PAGE_SIZE,
  DEAL_LIST_KANBAN_PAGE_SIZE,
} from "@/lib/crm/list-page-sizes";

export type DealsFocus =
  | "all"
  | "proposals-sent-30d"
  | "won-after-proposal-30d"
  | "followup-open"
  | "followup-overdue";

export type DealListSort = "az" | "za" | "newest" | "oldest";

const MAX_PAGE_SIZE = 500;

export type ListDealsParams = {
  tenantId: string;
  focus?: DealsFocus;
  stageId?: string;
  search?: string;
  sort?: DealListSort;
  page?: number;
  pageSize?: number;
  includeCounts?: boolean;
};

async function focusWhere(
  tenantId: string,
  focus: DealsFocus | undefined,
): Promise<Prisma.CrmDealWhereInput> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  switch (focus) {
    case "proposals-sent-30d":
      return { proposalSentAt: { gte: thirtyDaysAgo } };
    case "followup-open":
      return { status: "open", proposalSentAt: { not: null } };
    case "followup-overdue":
      return {
        status: "open",
        followUpLogs: {
          some: { status: "pending", scheduledAt: { lte: now } },
        },
      };
    case "won-after-proposal-30d": {
      const wonStageIds = await prisma.crmPipelineStage.findMany({
        where: { tenantId, isClosedWon: true },
        select: { id: true },
      });
      return {
        status: "won",
        proposalSentAt: { not: null },
        stageHistory: {
          some: {
            toStageId: { in: wonStageIds.map((s) => s.id) },
            changedAt: { gte: thirtyDaysAgo },
          },
        },
      };
    }
    case "all":
    default:
      return {};
  }
}

async function buildWhere(params: ListDealsParams): Promise<Prisma.CrmDealWhereInput> {
  const and: Prisma.CrmDealWhereInput[] = [
    { tenantId: params.tenantId },
    await focusWhere(params.tenantId, params.focus),
  ];
  if (params.stageId && params.stageId !== "all") {
    and.push({ stageId: params.stageId });
  }
  const q = params.search?.trim();
  if (q) {
    and.push({
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { account: { name: { contains: q, mode: "insensitive" } } },
        {
          primaryContact: {
            OR: [
              { firstName: { contains: q, mode: "insensitive" } },
              { lastName: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
            ],
          },
        },
      ],
    });
  }
  return { AND: and };
}

function orderBy(sort: DealListSort | undefined): Prisma.CrmDealOrderByWithRelationInput {
  switch (sort) {
    case "oldest":
      return { createdAt: "asc" };
    case "az":
      return { title: "asc" };
    case "za":
      return { title: "desc" };
    case "newest":
    default:
      return { createdAt: "desc" };
  }
}

const includeRelations = {
  stage: true,
  primaryContact: true,
  account: {
    select: { id: true, name: true, type: true, status: true },
  },
  quotes: { select: { quoteId: true } },
  stageHistory: {
    orderBy: { changedAt: "desc" as const },
    select: { toStageId: true, changedAt: true },
    take: 5,
  },
  followUpLogs: {
    where: { status: "pending" },
    orderBy: { scheduledAt: "asc" as const },
    take: 1,
    select: {
      id: true,
      sequence: true,
      status: true,
      scheduledAt: true,
    },
  },
} satisfies Prisma.CrmDealInclude;

export async function listCrmDeals(params: ListDealsParams) {
  const where = await buildWhere(params);
  const paginated = params.page != null || params.pageSize != null;
  const pageSize = paginated
    ? Math.min(Math.max(params.pageSize ?? DEAL_LIST_DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE)
    : undefined;
  const page = paginated ? Math.max(params.page ?? 1, 1) : 1;
  const skip = pageSize != null ? (page - 1) * pageSize : undefined;

  const [total, deals, ufValue] = await Promise.all([
    prisma.crmDeal.count({ where }),
    prisma.crmDeal.findMany({
      where,
      include: includeRelations,
      orderBy: orderBy(params.sort),
      ...(skip != null ? { skip } : {}),
      ...(pageSize != null ? { take: pageSize } : {}),
    }),
    getUfValue(),
  ]);

  const quoteIds = collectLinkedQuoteIds(deals);
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

  const items = deals.map((deal) => ({
    ...deal,
    activeQuoteSummary: resolveDealActiveQuotationSummary(deal, quoteById, ufValue),
  }));

  return {
    deals: items,
    total,
    page,
    pageSize: pageSize ?? total,
    hasMore: paginated ? page * (pageSize ?? total) < total : false,
    ufValue,
  };
}
