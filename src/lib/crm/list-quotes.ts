/**
 * Listado paginado de cotizaciones CPQ (vista CRM).
 * Usa salePriceMonthly persistido — no recalcula costos en el listado.
 *
 * Nota: CpqQuote solo tiene FK sueltas (accountId/dealId/contactId) sin
 * relations Prisma hacia CrmAccount/CrmDeal/CrmContact; se resuelven en batch.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { QUOTE_LIST_DEFAULT_PAGE_SIZE } from "@/lib/crm/list-page-sizes";

export { QUOTE_LIST_DEFAULT_PAGE_SIZE } from "@/lib/crm/list-page-sizes";

export type QuoteStatusFilter = "all" | "draft" | "sent" | "approved" | "rejected";
export type QuoteListSort = "az" | "za" | "newest" | "oldest";

export type QuoteListCounts = {
  total: number;
  draft: number;
  sent: number;
  approved: number;
  rejected: number;
};

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

/**
 * Cláusula OR de búsqueda (código/nombre/cliente + negocios/cuentas que hacen
 * match). Se resuelve una sola vez para reutilizarla tanto en el `where` del
 * listado (con status) como en el de los conteos (sin status).
 */
async function resolveSearchOr(
  params: ListQuotesParams,
): Promise<Prisma.CpqQuoteWhereInput | null> {
  const q = params.search?.trim();
  if (!q) return null;
  const [matchingDeals, matchingAccounts] = await Promise.all([
    prisma.crmDeal.findMany({
      where: { tenantId: params.tenantId, title: { contains: q, mode: "insensitive" } },
      select: { id: true },
      take: 500,
    }),
    prisma.crmAccount.findMany({
      where: { tenantId: params.tenantId, name: { contains: q, mode: "insensitive" } },
      select: { id: true },
      take: 500,
    }),
  ]);
  const dealIds = matchingDeals.map((d) => d.id);
  const accountIds = matchingAccounts.map((a) => a.id);
  return {
    OR: [
      { code: { contains: q, mode: "insensitive" } },
      { name: { contains: q, mode: "insensitive" } },
      { clientName: { contains: q, mode: "insensitive" } },
      ...(dealIds.length > 0 ? [{ dealId: { in: dealIds } }] : []),
      ...(accountIds.length > 0 ? [{ accountId: { in: accountIds } }] : []),
    ],
  };
}

/**
 * AND base del listado (tenant + lead/deal + búsqueda), SIN el filtro de
 * status. Los conteos por status se derivan de este mismo conjunto para que
 * las pills reflejen la búsqueda activa.
 */
function buildBaseAnd(
  params: ListQuotesParams,
  searchOr: Prisma.CpqQuoteWhereInput | null,
): Prisma.CpqQuoteWhereInput[] {
  const and: Prisma.CpqQuoteWhereInput[] = [{ tenantId: params.tenantId }];
  if (params.leadId) and.push({ createdFromLeadId: params.leadId });
  if (params.dealId) and.push({ dealId: params.dealId });
  if (searchOr) and.push(searchOr);
  return and;
}

function andToWhere(and: Prisma.CpqQuoteWhereInput[]): Prisma.CpqQuoteWhereInput {
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
  return countsFromWhere({ tenantId });
}

/**
 * Conteos por status a partir de un `where` arbitrario (mismo conjunto que el
 * listado, sin el filtro de status). Se usa cuando hay búsqueda activa para que
 * las pills muestren los totales del subconjunto encontrado.
 */
async function countsFromWhere(
  where: Prisma.CpqQuoteWhereInput,
): Promise<QuoteListCounts> {
  const grouped = await prisma.cpqQuote.groupBy({
    by: ["status"],
    where,
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
  const searchOr = await resolveSearchOr(params);
  const baseAnd = buildBaseAnd(params, searchOr);
  const listAnd =
    params.status && params.status !== "all"
      ? [...baseAnd, { status: params.status }]
      : baseAnd;
  const where = andToWhere(listAnd);
  const paginated = params.page != null || params.pageSize != null;
  const pageSize = paginated
    ? Math.min(Math.max(params.pageSize ?? QUOTE_LIST_DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE)
    : undefined;
  const page = paginated ? Math.max(params.page ?? 1, 1) : 1;
  const skip = pageSize != null ? (page - 1) * pageSize : undefined;

  // Con búsqueda activa los conteos se calculan sobre el mismo subconjunto
  // (base sin status); sin búsqueda usamos el conteo global rápido por tenant.
  const countsPromise = !params.includeCounts
    ? Promise.resolve(undefined)
    : searchOr
      ? countsFromWhere(andToWhere(baseAnd))
      : getQuoteListCounts(params.tenantId);

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
        proposalBundleQuote: {
          select: {
            bundleId: true,
            includedInProposal: true,
            displayOrder: true,
            bundle: {
              select: {
                id: true,
                code: true,
                name: true,
                status: true,
                _count: { select: { quotes: true } },
              },
            },
          },
        },
      },
    }),
    countsPromise,
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

    const link = q.proposalBundleQuote;
    const proposal = link
      ? {
          bundleId: link.bundleId,
          code: link.bundle.code,
          name: link.bundle.name,
          status: link.bundle.status,
          memberCount: link.bundle._count.quotes,
          includedInProposal: link.includedInProposal,
        }
      : null;

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
      proposal,
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
