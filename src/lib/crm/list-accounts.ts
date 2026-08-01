/**
 * Listado paginado de cuentas CRM con enriquecimiento (cobertura contratos,
 * cashflow, guardias). Usado por la page SSR y por GET /api/crm/accounts.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getInstallationContractCoverage } from "@/lib/crm/installation-contracts";

export type AccountLifecycle = "prospect" | "client_active" | "client_inactive";
export type AccountSort = "az" | "za" | "newest" | "oldest";

export type AccountListRow = {
  id: string;
  name: string;
  rut: string | null;
  legalName: string | null;
  legalRepresentativeName: string | null;
  legalRepresentativeRut: string | null;
  segment: string | null;
  industry: string | null;
  website: string | null;
  notes: string | null;
  logoUrl: string | null;
  type: string;
  status: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  _count: {
    contacts: number;
    deals: number;
    installations: number;
  };
  contractCoverage: {
    totalInstallations: number;
    withContract: number;
    missingContract: number;
    expiredContract: number;
    expiringContract: number;
  };
  cashflowItemCount: number;
  cashflowMonthlyAmount:
    | { amount: number; currency: string }
    | Array<{ amount: number; currency: string }>
    | null;
  activeGuardsCount: number;
};

export type AccountListCounts = {
  prospects: number;
  clientActive: number;
  clientInactive: number;
  total: number;
};

export type ListAccountsParams = {
  tenantId: string;
  /** Si false, solo clientes activos (sin acceso a leads/prospectos). */
  canSeeLeads?: boolean;
  lifecycle?: AccountLifecycle | "all";
  search?: string;
  sort?: AccountSort;
  /** 1-based. Si se omite junto con pageSize, se devuelve todo (compat). */
  page?: number;
  pageSize?: number;
  /** Filtros legacy usados por otros consumidores del API. */
  type?: string;
  active?: "true" | "false";
  status?: string;
  includeCounts?: boolean;
};

export type ListAccountsResult = {
  accounts: AccountListRow[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  counts?: AccountListCounts;
};

function lifecycleWhere(lifecycle: AccountLifecycle): Prisma.CrmAccountWhereInput {
  // `status` es canónico; OR con type/isActive cubre filas legacy sin migrar.
  if (lifecycle === "prospect") {
    return {
      OR: [{ status: "prospect" }, { type: "prospect", status: { notIn: ["client_active", "client_inactive"] } }],
    };
  }
  if (lifecycle === "client_inactive") {
    return {
      OR: [
        { status: "client_inactive" },
        { type: "client", isActive: false, status: { notIn: ["prospect", "client_active"] } },
      ],
    };
  }
  return {
    OR: [
      { status: "client_active" },
      { type: "client", isActive: true, status: { notIn: ["prospect", "client_inactive"] } },
    ],
  };
}

/** Exported for unit tests — construye el where Prisma del listado. */
export function buildAccountListWhere(params: ListAccountsParams): Prisma.CrmAccountWhereInput {
  const and: Prisma.CrmAccountWhereInput[] = [{ tenantId: params.tenantId }];

  if (params.canSeeLeads === false) {
    and.push({ type: "client", isActive: true });
  }

  if (params.lifecycle && params.lifecycle !== "all") {
    and.push(lifecycleWhere(params.lifecycle));
  }

  if (params.type) and.push({ type: params.type });
  if (params.active === "true") and.push({ isActive: true });
  if (params.active === "false") and.push({ isActive: false });
  if (params.status) and.push({ status: params.status });

  const q = params.search?.trim();
  if (q) {
    and.push({
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { rut: { contains: q, mode: "insensitive" } },
        { industry: { contains: q, mode: "insensitive" } },
        { legalName: { contains: q, mode: "insensitive" } },
      ],
    });
  }

  return and.length === 1 ? and[0]! : { AND: and };
}

function orderBy(sort: AccountSort | undefined): Prisma.CrmAccountOrderByWithRelationInput {
  switch (sort) {
    case "za":
      return { name: "desc" };
    case "newest":
      return { createdAt: "desc" };
    case "oldest":
      return { createdAt: "asc" };
    case "az":
    default:
      return { name: "asc" };
  }
}

async function enrichAccounts(
  tenantId: string,
  accounts: Array<{
    id: string;
    installations: Array<{ id: string; status: string }>;
    [key: string]: unknown;
  }>,
): Promise<AccountListRow[]> {
  if (accounts.length === 0) return [];

  const accountIds = accounts.map((a) => a.id);
  const allInstallationIds = accounts.flatMap((a) => a.installations.map((i) => i.id));
  const installationAccountMap = new Map<string, string>();
  for (const account of accounts) {
    for (const inst of account.installations) {
      installationAccountMap.set(inst.id, account.id);
    }
  }

  const [contractCoverage, cashflowItems, puestos] = await Promise.all([
    getInstallationContractCoverage({
      tenantId,
      installationIds: allInstallationIds,
      installationAccountMap,
    }),
    prisma.financeCashflowItem.findMany({
      where: {
        tenantId,
        source: { in: ["CONTRACT", "OTHER"] },
        isActive: true,
        crmAccountId: { in: accountIds },
      },
      select: { crmAccountId: true, amount: true, currency: true },
    }),
    allInstallationIds.length > 0
      ? prisma.opsPuestoOperativo.findMany({
          where: { tenantId, installationId: { in: allInstallationIds }, active: true },
          select: { installationId: true, requiredGuards: true },
        })
      : Promise.resolve([]),
  ]);

  const cashflowCountByAccount = new Map<string, number>();
  const cashflowAmountsByAccount = new Map<string, Map<string, number>>();
  for (const item of cashflowItems) {
    if (!item.crmAccountId) continue;
    cashflowCountByAccount.set(
      item.crmAccountId,
      (cashflowCountByAccount.get(item.crmAccountId) ?? 0) + 1,
    );
    const accMap =
      cashflowAmountsByAccount.get(item.crmAccountId) ?? new Map<string, number>();
    const cur = item.currency ?? "CLP";
    accMap.set(cur, (accMap.get(cur) ?? 0) + Number(item.amount));
    cashflowAmountsByAccount.set(item.crmAccountId, accMap);
  }

  const guardsByInstallation = new Map<string, number>();
  for (const p of puestos) {
    guardsByInstallation.set(
      p.installationId,
      (guardsByInstallation.get(p.installationId) ?? 0) + p.requiredGuards,
    );
  }

  return accounts.map(({ installations, ...account }) => {
    const activeInstallations = installations.filter((i) => i.status === "active");
    const statuses = activeInstallations.map(
      (i) => contractCoverage.get(i.id)?.status ?? "sin_documento",
    );
    const withContract = statuses.filter((s) => s !== "sin_documento").length;
    const expiredContract = statuses.filter((s) => s === "vencido").length;
    const expiringContract = statuses.filter((s) => s === "por_vencer").length;
    const activeGuardsCount = activeInstallations.reduce(
      (sum, i) => sum + (guardsByInstallation.get(i.id) ?? 0),
      0,
    );

    const m = cashflowAmountsByAccount.get(account.id as string);
    let cashflowMonthlyAmount: AccountListRow["cashflowMonthlyAmount"] = null;
    if (m && m.size > 0) {
      const entries = Array.from(m.entries()).map(([currency, amount]) => ({
        amount,
        currency,
      }));
      cashflowMonthlyAmount = entries.length === 1 ? entries[0]! : entries;
    }

    return {
      ...(account as Omit<AccountListRow, "contractCoverage" | "cashflowItemCount" | "cashflowMonthlyAmount" | "activeGuardsCount">),
      contractCoverage: {
        totalInstallations: activeInstallations.length,
        withContract,
        missingContract: activeInstallations.length - withContract,
        expiredContract,
        expiringContract,
      },
      cashflowItemCount: cashflowCountByAccount.get(account.id as string) ?? 0,
      cashflowMonthlyAmount,
      activeGuardsCount,
    };
  });
}

export async function getAccountListCounts(
  tenantId: string,
  canSeeLeads = true,
): Promise<AccountListCounts> {
  if (!canSeeLeads) {
    const clientActive = await prisma.crmAccount.count({
      where: { tenantId, type: "client", isActive: true },
    });
    return { prospects: 0, clientActive, clientInactive: 0, total: clientActive };
  }

  const grouped = await prisma.crmAccount.groupBy({
    by: ["status"],
    where: { tenantId },
    _count: { _all: true },
  });

  let prospects = 0;
  let clientActive = 0;
  let clientInactive = 0;
  let other = 0;
  for (const row of grouped) {
    const n = row._count._all;
    if (row.status === "prospect") prospects += n;
    else if (row.status === "client_active") clientActive += n;
    else if (row.status === "client_inactive") clientInactive += n;
    else other += n;
  }

  // Filas legacy sin status canónico: repartir por type/isActive.
  if (other > 0) {
    const [legacyProspects, legacyActive, legacyInactive] = await Promise.all([
      prisma.crmAccount.count({
        where: {
          tenantId,
          status: { notIn: ["prospect", "client_active", "client_inactive"] },
          type: "prospect",
        },
      }),
      prisma.crmAccount.count({
        where: {
          tenantId,
          status: { notIn: ["prospect", "client_active", "client_inactive"] },
          type: "client",
          isActive: true,
        },
      }),
      prisma.crmAccount.count({
        where: {
          tenantId,
          status: { notIn: ["prospect", "client_active", "client_inactive"] },
          type: "client",
          isActive: false,
        },
      }),
    ]);
    prospects += legacyProspects;
    clientActive += legacyActive;
    clientInactive += legacyInactive;
  }

  return {
    prospects,
    clientActive,
    clientInactive,
    total: prospects + clientActive + clientInactive,
  };
}

export const ACCOUNT_LIST_DEFAULT_PAGE_SIZE = 50;
const ACCOUNT_LIST_MAX_PAGE_SIZE = 200;

export async function listCrmAccounts(params: ListAccountsParams): Promise<ListAccountsResult> {
  const where = buildAccountListWhere(params);
  const paginated = params.page != null || params.pageSize != null;
  const pageSize = paginated
    ? Math.min(
        Math.max(params.pageSize ?? ACCOUNT_LIST_DEFAULT_PAGE_SIZE, 1),
        ACCOUNT_LIST_MAX_PAGE_SIZE,
      )
    : undefined;
  const page = paginated ? Math.max(params.page ?? 1, 1) : 1;
  const skip = pageSize != null ? (page - 1) * pageSize : undefined;

  const [total, rows, counts] = await Promise.all([
    prisma.crmAccount.count({ where }),
    prisma.crmAccount.findMany({
      where,
      include: {
        installations: {
          orderBy: { name: "asc" },
          select: { id: true, status: true },
        },
        _count: { select: { contacts: true, deals: true, installations: true } },
      },
      orderBy: orderBy(params.sort),
      ...(skip != null ? { skip } : {}),
      ...(pageSize != null ? { take: pageSize } : {}),
    }),
    params.includeCounts
      ? getAccountListCounts(params.tenantId, params.canSeeLeads !== false)
      : Promise.resolve(undefined),
  ]);

  const accounts = await enrichAccounts(params.tenantId, rows);
  const effectivePageSize = pageSize ?? total;

  return {
    accounts,
    total,
    page,
    pageSize: effectivePageSize,
    hasMore: paginated ? page * effectivePageSize < total : false,
    counts,
  };
}
