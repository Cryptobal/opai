/**
 * Listado paginado de contactos CRM.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { CONTACT_LIST_DEFAULT_PAGE_SIZE } from "@/lib/crm/list-page-sizes";

export { CONTACT_LIST_DEFAULT_PAGE_SIZE } from "@/lib/crm/list-page-sizes";

export type ContactListFilter = "active" | "all" | "with_account" | "without_account";
export type ContactListSort = "az" | "za" | "newest" | "oldest";

export type ContactListCounts = {
  active: number;
  all: number;
  withAccount: number;
  withoutAccount: number;
};

const MAX_PAGE_SIZE = 200;

export type ListContactsParams = {
  tenantId: string;
  filter?: ContactListFilter;
  search?: string;
  sort?: ContactListSort;
  page?: number;
  pageSize?: number;
  includeCounts?: boolean;
  /** Filtros legacy del API */
  accountId?: string;
  portalEnabled?: boolean;
};

function filterWhere(filter: ContactListFilter | undefined): Prisma.CrmContactWhereInput | undefined {
  if (!filter || filter === "all") return undefined;
  if (filter === "active") return { account: { status: "client_active" } };
  // accountId es NOT NULL en schema: todo contacto tiene cuenta.
  if (filter === "with_account") return undefined;
  // "Sin cuenta" queda vacío (compat UI legacy).
  return { id: { in: [] } };
}

function buildWhere(params: ListContactsParams): Prisma.CrmContactWhereInput {
  const and: Prisma.CrmContactWhereInput[] = [{ tenantId: params.tenantId }];
  if (params.accountId) and.push({ accountId: params.accountId });
  if (params.portalEnabled) and.push({ portalEnabled: true });
  const fw = filterWhere(params.filter);
  if (fw) and.push(fw);

  const q = params.search?.trim();
  if (q) {
    and.push({
      OR: [
        { firstName: { contains: q, mode: "insensitive" } },
        { lastName: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { phone: { contains: q, mode: "insensitive" } },
        { account: { name: { contains: q, mode: "insensitive" } } },
      ],
    });
  }
  return and.length === 1 ? and[0]! : { AND: and };
}

function orderBy(sort: ContactListSort | undefined): Prisma.CrmContactOrderByWithRelationInput[] {
  switch (sort) {
    case "oldest":
      return [{ createdAt: "asc" }];
    case "az":
      return [{ firstName: "asc" }, { lastName: "asc" }];
    case "za":
      return [{ firstName: "desc" }, { lastName: "desc" }];
    case "newest":
    default:
      return [{ createdAt: "desc" }];
  }
}

export async function getContactListCounts(tenantId: string): Promise<ContactListCounts> {
  const [all, active] = await Promise.all([
    prisma.crmContact.count({ where: { tenantId } }),
    prisma.crmContact.count({ where: { tenantId, account: { status: "client_active" } } }),
  ]);
  // accountId es obligatorio: "con cuenta" = todos; "sin cuenta" = 0.
  return { all, active, withAccount: all, withoutAccount: 0 };
}

export async function listCrmContacts(params: ListContactsParams) {
  const where = buildWhere(params);
  const paginated = params.page != null || params.pageSize != null;
  const pageSize = paginated
    ? Math.min(Math.max(params.pageSize ?? CONTACT_LIST_DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE)
    : undefined;
  const page = paginated ? Math.max(params.page ?? 1, 1) : 1;
  const skip = pageSize != null ? (page - 1) * pageSize : undefined;

  const [total, contacts, counts] = await Promise.all([
    prisma.crmContact.count({ where }),
    prisma.crmContact.findMany({
      where,
      include: {
        account: {
          select: {
            id: true,
            name: true,
            type: true,
            status: true,
            isActive: true,
          },
        },
        companyPresentations: {
          where: { status: { in: ["sent", "viewed"] } },
          select: { id: true, status: true },
          take: 1,
        },
      },
      orderBy: orderBy(params.sort),
      ...(skip != null ? { skip } : {}),
      ...(pageSize != null ? { take: pageSize } : {}),
    }),
    params.includeCounts ? getContactListCounts(params.tenantId) : Promise.resolve(undefined),
  ]);

  return {
    contacts,
    total,
    page,
    pageSize: pageSize ?? total,
    hasMore: paginated ? page * (pageSize ?? total) < total : false,
    counts,
  };
}
