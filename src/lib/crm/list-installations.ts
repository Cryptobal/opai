/**
 * Listado paginado de instalaciones CRM con slots/guardias.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { INSTALLATION_LIST_DEFAULT_PAGE_SIZE } from "@/lib/crm/list-page-sizes";

export { INSTALLATION_LIST_DEFAULT_PAGE_SIZE } from "@/lib/crm/list-page-sizes";

export type InstallationStatusFilter = "all" | "active" | "inactive";
export type InstallationListSort = "az" | "za" | "newest" | "oldest";

export type InstallationListCounts = {
  all: number;
  active: number;
  inactive: number;
};

const MAX_PAGE_SIZE = 200;

export type ListInstallationsParams = {
  tenantId: string;
  status?: InstallationStatusFilter;
  search?: string;
  sort?: InstallationListSort;
  page?: number;
  pageSize?: number;
  includeCounts?: boolean;
  accountId?: string;
  /** Si false, solo instalaciones activas (sin acceso a deals). */
  canSeeDeals?: boolean;
};

function statusWhere(
  status: InstallationStatusFilter | undefined,
  canSeeDeals: boolean,
): Prisma.CrmInstallationWhereInput | undefined {
  if (canSeeDeals === false) return { status: "active" };
  if (!status || status === "all") return undefined;
  if (status === "active") return { status: "active" };
  // UI: inactive = inactive | prospect
  return { status: { in: ["inactive", "prospect"] } };
}

function buildWhere(params: ListInstallationsParams): Prisma.CrmInstallationWhereInput {
  const and: Prisma.CrmInstallationWhereInput[] = [{ tenantId: params.tenantId }];
  if (params.accountId) and.push({ accountId: params.accountId });
  const sw = statusWhere(params.status, params.canSeeDeals !== false);
  if (sw) and.push(sw);

  const q = params.search?.trim();
  if (q) {
    and.push({
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { address: { contains: q, mode: "insensitive" } },
        { city: { contains: q, mode: "insensitive" } },
        { commune: { contains: q, mode: "insensitive" } },
        { account: { name: { contains: q, mode: "insensitive" } } },
      ],
    });
  }
  return and.length === 1 ? and[0]! : { AND: and };
}

function orderBy(
  sort: InstallationListSort | undefined,
): Prisma.CrmInstallationOrderByWithRelationInput {
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

export async function getInstallationListCounts(
  tenantId: string,
  canSeeDeals = true,
): Promise<InstallationListCounts> {
  if (!canSeeDeals) {
    const active = await prisma.crmInstallation.count({
      where: { tenantId, status: "active" },
    });
    return { all: active, active, inactive: 0 };
  }
  const [all, active, inactive] = await Promise.all([
    prisma.crmInstallation.count({ where: { tenantId } }),
    prisma.crmInstallation.count({ where: { tenantId, status: "active" } }),
    prisma.crmInstallation.count({
      where: { tenantId, status: { in: ["inactive", "prospect"] } },
    }),
  ]);
  return { all, active, inactive };
}

async function enrichSlotsAndGuards(
  tenantId: string,
  installationIds: string[],
): Promise<Map<string, { totalSlots: number; assignedGuards: number }>> {
  const map = new Map<string, { totalSlots: number; assignedGuards: number }>();
  for (const id of installationIds) map.set(id, { totalSlots: 0, assignedGuards: 0 });
  if (installationIds.length === 0) return map;

  const [puestos, asignaciones] = await Promise.all([
    prisma.opsPuestoOperativo.groupBy({
      by: ["installationId"],
      where: { tenantId, active: true, installationId: { in: installationIds } },
      _sum: { requiredGuards: true },
    }),
    prisma.opsAsignacionGuardia.groupBy({
      by: ["installationId"],
      where: { tenantId, isActive: true, installationId: { in: installationIds } },
      _count: { id: true },
    }),
  ]);

  for (const row of puestos) {
    const cur = map.get(row.installationId) ?? { totalSlots: 0, assignedGuards: 0 };
    cur.totalSlots = row._sum.requiredGuards ?? 0;
    map.set(row.installationId, cur);
  }
  for (const row of asignaciones) {
    const cur = map.get(row.installationId) ?? { totalSlots: 0, assignedGuards: 0 };
    cur.assignedGuards = row._count.id;
    map.set(row.installationId, cur);
  }
  return map;
}

export async function listCrmInstallations(params: ListInstallationsParams) {
  const where = buildWhere(params);
  const paginated = params.page != null || params.pageSize != null;
  const pageSize = paginated
    ? Math.min(Math.max(params.pageSize ?? INSTALLATION_LIST_DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE)
    : undefined;
  const page = paginated ? Math.max(params.page ?? 1, 1) : 1;
  const skip = pageSize != null ? (page - 1) * pageSize : undefined;

  const [total, rows, counts] = await Promise.all([
    prisma.crmInstallation.count({ where }),
    prisma.crmInstallation.findMany({
      where,
      select: {
        id: true,
        name: true,
        address: true,
        city: true,
        commune: true,
        lat: true,
        lng: true,
        status: true,
        nocturnoEnabled: true,
        createdAt: true,
        updatedAt: true,
        account: { select: { id: true, name: true, type: true, isActive: true } },
      },
      orderBy: orderBy(params.sort),
      ...(skip != null ? { skip } : {}),
      ...(pageSize != null ? { take: pageSize } : {}),
    }),
    params.includeCounts
      ? getInstallationListCounts(params.tenantId, params.canSeeDeals !== false)
      : Promise.resolve(undefined),
  ]);

  const enrich = await enrichSlotsAndGuards(
    params.tenantId,
    rows.map((r) => r.id),
  );

  const installations = rows.map((inst) => ({
    ...inst,
    totalSlots: enrich.get(inst.id)?.totalSlots ?? 0,
    assignedGuards: enrich.get(inst.id)?.assignedGuards ?? 0,
  }));

  return {
    installations,
    total,
    page,
    pageSize: pageSize ?? total,
    hasMore: paginated ? page * (pageSize ?? total) < total : false,
    counts,
  };
}
