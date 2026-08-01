/**
 * Listado paginado de cotizaciones CPQ (vista CRM).
 * Usa salePriceMonthly persistido — no recalcula costos en el listado.
 *
 * Nota: CpqQuote solo tiene FK sueltas (accountId/dealId/contactId) sin
 * relations Prisma hacia CrmAccount/CrmDeal/CrmContact; se resuelven en batch.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type QuoteStatusFilter = "all" | "draft" | "sent" | "approved" | "rejected";
export type QuoteListSort = "az" | "za" | "newest" | "oldest";

export type QuoteListCounts = {
  total: number;
  draft: number;
  sent: number;
  approved: number;
  rejected: number;
};

export const QUOTE_LIST_DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

export type ListQuotesParams = {
  tenantId: string;
  status?: QuoteStatusFilter;
  search?: string;
  sort?: QuoteListSort;
  page?: number;
  pageSize?: number;
  includeCounts?: boolean;
  leadId?: string;
  dealId?: string;
};

async function buildWhereAsync(params: ListQuotesParams): Promise<Prisma.CpqQuoteWhereInput> {
  const and: Prisma.CpqQuoteWhereInput[] = [{ tenantId: params.tenantId }];
  if (params.leadId) and.push({ createdFromLeadId: params.leadId });
  if (params.dealId) and.push({ dealId: params.dealId });
  if (params.status && params.status !== "all") and.push({ status: params.status });

  const q = params.search?.trim();
  if (q) {
    const [matchingDeals, matchingAccounts] = await Promise.all([
      prisma.crmDeal.findMany({
        where: { tenantId: params.tenantId, title: { contains: q, mode: "insensitive" } },
        select: { id: true },
        take: 100,
      }),
      prisma.crmAccount.findMany({
        where: { tenantId: params.tenantId, name: { contains: q, mode: "insensitive" } },
        select: { id: true },
        take: 100,
      }),
    ]);
    const dealIds = matchingDeals.map((d) => d.id);
    const accountIds = matchingAccounts.map((a) => a.id);
    and.push({
      OR: [
        { code: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
        { clientName: { contains: q, mode: "insensitive" } },
        ...(dealIds.length > 0 ? [{ dealId: { in: dealIds } }] : []),
        ...(accountIds.length > 0 ? [{ accountId: { in: accountIds } }] : []),
      ],
    });
  }
  return and.length === 1 ? and[0]! : { AND: and };
}

function orderBy(sort: QuoteListSort | undefined): Prisma.CpqQuoteOrderByWithRelationInput {
  switch (sort) {
    case "oldest":
      return { createdAt: "asc" };
    case "az":
      return { code: "asc" };
    case "za":
      return { code: "desc" };
    case "newest":
    default:
      return { createdAt: "desc" };
  }
}

export async function getQuoteListCounts(tenantId: string): Promise<QuoteListCounts> {
  const grouped = await prisma.cpqQuote.groupBy({
    by: ["status"],
    where: { tenantId },
    _count: { _all: true },
  });
  let draft = 0;
  let sent = 0;
  let approved = 0;
  let rejected = 0;
  let other = 0;
  for (const row of grouped) {
    const n = row._count._all;
    if (row.status === "draft") draft += n;
    else if (row.status === "sent") sent += n;
    else if (row.status === "approved") approved += n;
    else if (row.status === "rejected") rejected += n;
    else other += n;
  }
  return {
    total: draft + sent + approved + rejected + other,
    draft,
    sent,
    approved,
    rejected,
  };
}

export async function listCrmQuotes(params: ListQuotesParams) {
  const where = await buildWhereAsync(params);
  const paginated = params.page != null || params.pageSize != null;
  const pageSize = paginated
    ? Math.min(Math.max(params.pageSize ?? QUOTE_LIST_DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE)
    : undefined;
  const page = paginated ? Math.max(params.page ?? 1, 1) : 1;
  const skip = pageSize != null ? (page - 1) * pageSize : undefined;

  const [total, quotes, counts] = await Promise.all([
    prisma.cpqQuote.count({ where }),
    prisma.cpqQuote.findMany({
      where,
      orderBy: orderBy(params.sort),
      ...(skip != null ? { skip } : {}),
      ...(pageSize != null ? { take: pageSize } : {}),
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
        clientName: true,
        monthlyCost: true,
        currency: true,
        totalPositions: true,
        totalGuards: true,
        createdAt: true,
        updatedAt: true,
        accountId: true,
        dealId: true,
        contactId: true,
        createdFromLeadId: true,
        parameters: {
          select: { salePriceMonthly: true, marginPct: true },
        },
        additionalLines: {
          select: { precio: true },
        },
      },
    }),
    params.includeCounts ? getQuoteListCounts(params.tenantId) : Promise.resolve(undefined),
  ]);

  const dealIds = Array.from(
    new Set(quotes.map((q) => q.dealId).filter((id): id is string => Boolean(id))),
  );
  const accountIds = Array.from(
    new Set(quotes.map((q) => q.accountId).filter((id): id is string => Boolean(id))),
  );
  let contactIds = quotes.map((q) => q.contactId).filter((id): id is string => Boolean(id));

  const [dealsRaw, accountsMap, followUpCounts] = await Promise.all([
    dealIds.length > 0
      ? prisma.crmDeal.findMany({
          where: { id: { in: dealIds }, tenantId: params.tenantId },
          select: {
            id: true,
            title: true,
            stage: { select: { name: true, color: true } },
            primaryContactId: true,
          },
        })
      : Promise.resolve([]),
    accountIds.length > 0
      ? prisma.crmAccount
          .findMany({
            where: { id: { in: accountIds }, tenantId: params.tenantId },
            select: { id: true, name: true },
          })
          .then((rows) => new Map(rows.map((r) => [r.id, r.name])))
      : Promise.resolve(new Map<string, string>()),
    dealIds.length > 0
      ? prisma.crmFollowUpLog
          .groupBy({
            by: ["dealId"],
            where: { dealId: { in: dealIds }, status: "pending" },
            _count: true,
          })
          .then((rows) => new Map(rows.map((r) => [r.dealId, r._count])))
      : Promise.resolve(new Map<string, number>()),
  ]);

  const dealsMap = new Map(dealsRaw.map((r) => [r.id, r.title]));
  const dealStageMap = new Map(
    dealsRaw.map((r) => [r.id, r.stage ? { name: r.stage.name, color: r.stage.color } : null]),
  );
  for (const d of dealsRaw) {
    if (d.primaryContactId) contactIds.push(d.primaryContactId);
  }
  contactIds = Array.from(new Set(contactIds));

  const contactsRaw =
    contactIds.length > 0
      ? await prisma.crmContact.findMany({
          where: { id: { in: contactIds }, tenantId: params.tenantId },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
  const contactsMap = new Map(
    contactsRaw.map((c) => [c.id, `${c.firstName} ${c.lastName}`.trim()]),
  );

  const items = quotes.map((q) => {
    const salePriceMonthly = Number(q.parameters?.salePriceMonthly ?? 0);
    const marginPct = Number(q.parameters?.marginPct ?? 13);
    const additionalLinesTotal = q.additionalLines.reduce(
      (sum, l) => sum + Number(l.precio || 0),
      0,
    );
    let displaySale = salePriceMonthly;
    if (displaySale <= 0) {
      const cost = Number(q.monthlyCost || 0);
      const margin = marginPct / 100;
      if (cost > 0 && margin < 1) {
        displaySale = cost / (1 - margin) + additionalLinesTotal;
      }
    }
    const resolvedContactId =
      q.contactId || (q.dealId ? dealsRaw.find((d) => d.id === q.dealId)?.primaryContactId : null) || null;

    return {
      id: q.id,
      code: q.code,
      name: q.name || q.clientName,
      status: q.status,
      clientName: q.clientName,
      monthlyCost: q.monthlyCost,
      currency: q.currency ?? "CLP",
      salePriceMonthly: displaySale,
      marginPct,
      totalPositions: q.totalPositions,
      totalGuards: q.totalGuards,
      createdAt: q.createdAt,
      updatedAt: q.updatedAt,
      accountId: q.accountId || null,
      dealId: q.dealId || null,
      dealTitle: (q.dealId && dealsMap.get(q.dealId)) || null,
      accountName: (q.accountId && accountsMap.get(q.accountId)) || null,
      contactId: resolvedContactId,
      contactName: resolvedContactId ? contactsMap.get(resolvedContactId) || null : null,
      dealStageName: (q.dealId && dealStageMap.get(q.dealId)?.name) || null,
      dealStageColor: (q.dealId && dealStageMap.get(q.dealId)?.color) || null,
      pendingFollowUps: (q.dealId && followUpCounts.get(q.dealId)) || 0,
      createdFromLeadId: q.createdFromLeadId || null,
    };
  });

  return {
    quotes: items,
    total,
    page,
    pageSize: pageSize ?? total,
    hasMore: paginated ? page * (pageSize ?? total) < total : false,
    counts,
  };
}
