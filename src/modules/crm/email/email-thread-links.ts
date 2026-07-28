/**
 * Vinculación polimórfica hilo↔entidad operacional (O01-O04 + Copiloto v2).
 *
 * Registry por tipo: búsqueda (picker con scope account|tenant), resolución
 * (label + estado + deep-link) y validación de existencia (tenant-scoped).
 */
import { prisma } from "@/lib/prisma";

export const THREAD_LINK_ENTITY_TYPES = [
  "installation",
  "guardia",
  "postulante",
  "proveedor",
  "factura",
  "incidente",
  "ops_ticket",
  "calendar_event",
  "quote",
  "contract",
] as const;
export type ThreadLinkEntityType = (typeof THREAD_LINK_ENTITY_TYPES)[number];

export function isThreadLinkEntityType(v: string): v is ThreadLinkEntityType {
  return (THREAD_LINK_ENTITY_TYPES as readonly string[]).includes(v);
}

/** Tipos cuya entidad tiene relación directa (o vía asociación) con cuenta. */
export const ACCOUNT_SCOPED_LINK_TYPES: ReadonlySet<ThreadLinkEntityType> = new Set([
  "installation",
  "quote",
  "contract",
  "factura",
]);

export type ThreadLinkCandidate = {
  id: string;
  label: string;
  sublabel: string | null;
  status: string | null;
  scope: "account" | "tenant";
};

export type ThreadLinkSearchResult = {
  candidates: ThreadLinkCandidate[];
  accountScopeApplies: boolean;
};

export type ResolvedThreadLink = {
  id: string;
  entityType: ThreadLinkEntityType;
  entityId: string;
  linkedVia: string;
  label: string;
  status: string | null;
  href: string | null;
};

const like = (q: string) => ({ contains: q, mode: "insensitive" as const });

function sortByScope(items: ThreadLinkCandidate[]): ThreadLinkCandidate[] {
  return [...items].sort((a, b) => {
    if (a.scope !== b.scope) return a.scope === "account" ? -1 : 1;
    return a.label.localeCompare(b.label, "es");
  });
}

/** Búsqueda de candidatos por tipo (para el picker del panel). */
export async function searchThreadLinkCandidates(params: {
  tenantId: string;
  type: ThreadLinkEntityType;
  q: string;
  accountId?: string | null;
  limit?: number;
}): Promise<ThreadLinkSearchResult> {
  const { tenantId, type } = params;
  const accountId = params.accountId?.trim() || null;
  const q = params.q.trim();
  const take = Math.min(params.limit ?? 20, 40);
  const accountScopeApplies = Boolean(accountId) && ACCOUNT_SCOPED_LINK_TYPES.has(type);

  if (type === "installation") {
    const rows = await prisma.crmInstallation.findMany({
      where: { tenantId, ...(q ? { name: like(q) } : {}) },
      select: { id: true, name: true, commune: true, status: true, accountId: true },
      orderBy: { name: "asc" },
      take: accountScopeApplies ? take * 2 : take,
    });
    const candidates = sortByScope(
      rows.map((r) => ({
        id: r.id,
        label: r.name,
        sublabel: r.commune,
        status: r.status,
        scope: (accountId && r.accountId === accountId ? "account" : "tenant") as
          | "account"
          | "tenant",
      })),
    ).slice(0, take);
    return { candidates, accountScopeApplies };
  }

  if (type === "quote") {
    const rows = await prisma.cpqQuote.findMany({
      where: {
        tenantId,
        ...(q
          ? {
              OR: [{ code: like(q) }, { name: like(q) }, { clientName: like(q) }],
            }
          : {}),
      },
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
        accountId: true,
        clientName: true,
      },
      orderBy: { updatedAt: "desc" },
      take: accountScopeApplies ? take * 2 : take,
    });
    const accountIds = Array.from(
      new Set(rows.map((r) => r.accountId).filter((id): id is string => Boolean(id))),
    );
    const accounts =
      accountIds.length > 0
        ? await prisma.crmAccount.findMany({
            where: { tenantId, id: { in: accountIds } },
            select: { id: true, name: true },
          })
        : [];
    const accountNameById = new Map(accounts.map((a) => [a.id, a.name]));
    const candidates = sortByScope(
      rows.map((r) => ({
        id: r.id,
        label: r.code + (r.name ? ` · ${r.name}` : ""),
        sublabel: (r.accountId && accountNameById.get(r.accountId)) || r.clientName || null,
        status: r.status,
        scope: (accountId && r.accountId === accountId ? "account" : "tenant") as
          | "account"
          | "tenant",
      })),
    ).slice(0, take);
    return { candidates, accountScopeApplies };
  }

  if (type === "contract") {
    // Contratos = Document con categoría contrato*, asociados a cuenta vía DocAssociation.
    const accountAssoc = accountId
      ? await prisma.docAssociation.findMany({
          where: { entityType: "crm_account", entityId: accountId },
          select: { documentId: true },
          take: 200,
        })
      : [];
    const accountDocIds = new Set(accountAssoc.map((a) => a.documentId));

    const rows = await prisma.document.findMany({
      where: {
        tenantId,
        category: { contains: "contrato", mode: "insensitive" },
        ...(q ? { title: like(q) } : {}),
      },
      select: {
        id: true,
        title: true,
        status: true,
        category: true,
        associations: {
          where: { entityType: "crm_account" },
          select: { entityId: true },
          take: 1,
        },
      },
      orderBy: { updatedAt: "desc" },
      take: accountScopeApplies ? take * 2 : take,
    });
    const candidates = sortByScope(
      rows.map((r) => {
        const linkedAccountId = r.associations[0]?.entityId ?? null;
        const inAccount = accountId ? accountDocIds.has(r.id) || linkedAccountId === accountId : false;
        return {
          id: r.id,
          label: r.title,
          sublabel: r.category,
          status: r.status,
          scope: (inAccount ? "account" : "tenant") as "account" | "tenant",
        };
      }),
    ).slice(0, take);
    return { candidates, accountScopeApplies };
  }

  if (type === "guardia" || type === "postulante") {
    const rows = await prisma.opsGuardia.findMany({
      where: {
        tenantId,
        ...(type === "postulante" ? { lifecycleStatus: "postulante" } : {}),
        ...(q
          ? {
              persona: {
                OR: [{ firstName: like(q) }, { lastName: like(q) }, { rut: like(q) }],
              },
            }
          : {}),
      },
      select: {
        id: true,
        status: true,
        lifecycleStatus: true,
        persona: { select: { firstName: true, lastName: true, rut: true } },
      },
      take,
    });
    return {
      candidates: rows.map((r) => ({
        id: r.id,
        label: `${r.persona.firstName} ${r.persona.lastName}`.trim(),
        sublabel: r.persona.rut,
        status: type === "postulante" ? r.lifecycleStatus : r.status,
        scope: "tenant" as const,
      })),
      accountScopeApplies: false,
    };
  }

  if (type === "proveedor") {
    const rows = await prisma.financeSupplier.findMany({
      where: {
        tenantId,
        ...(q ? { OR: [{ name: like(q) }, { rut: like(q) }] } : {}),
      },
      select: { id: true, name: true, rut: true },
      orderBy: { name: "asc" },
      take,
    });
    return {
      candidates: rows.map((r) => ({
        id: r.id,
        label: r.name,
        sublabel: r.rut,
        status: null,
        scope: "tenant" as const,
      })),
      accountScopeApplies: false,
    };
  }

  if (type === "factura") {
    // Scope por cuenta: receiverRut/name coincidente con la cuenta CRM.
    let accountRut: string | null = null;
    let accountName: string | null = null;
    if (accountId) {
      const acc = await prisma.crmAccount.findFirst({
        where: { id: accountId, tenantId },
        select: { rut: true, name: true },
      });
      accountRut = acc?.rut?.replace(/\./g, "").toLowerCase() ?? null;
      accountName = acc?.name ?? null;
    }
    const folio = Number(q);
    const rows = await prisma.financeDte.findMany({
      where: {
        tenantId,
        ...(q
          ? Number.isFinite(folio) && q.length < 10
            ? { folio }
            : { receiverName: like(q) }
          : {}),
      },
      select: {
        id: true,
        folio: true,
        receiverName: true,
        receiverRut: true,
        siiStatus: true,
        dueDate: true,
      },
      orderBy: { date: "desc" },
      take: accountScopeApplies ? take * 2 : take,
    });
    const candidates = sortByScope(
      rows.map((r) => {
        const rutNorm = r.receiverRut?.replace(/\./g, "").toLowerCase() ?? "";
        const inAccount =
          Boolean(accountRut && rutNorm && rutNorm === accountRut) ||
          Boolean(
            accountName &&
              r.receiverName.toLowerCase().includes(accountName.toLowerCase()),
          );
        return {
          id: r.id,
          label: `Folio ${r.folio} · ${r.receiverName}`,
          sublabel: r.dueDate ? `vence ${r.dueDate.toISOString().slice(0, 10)}` : null,
          status: r.siiStatus,
          scope: (inAccount ? "account" : "tenant") as "account" | "tenant",
        };
      }),
    ).slice(0, take);
    return { candidates, accountScopeApplies };
  }

  if (type === "calendar_event") {
    const rows = await prisma.calendarEvent.findMany({
      where: { tenantId, deletedAt: null, ...(q ? { title: like(q) } : {}) },
      select: { id: true, title: true, startAt: true, status: true },
      orderBy: { startAt: "desc" },
      take,
    });
    return {
      candidates: rows.map((r) => ({
        id: r.id,
        label: r.title,
        sublabel: r.startAt.toISOString().slice(0, 10),
        status: r.status,
        scope: "tenant" as const,
      })),
      accountScopeApplies: false,
    };
  }

  // incidente / ops_ticket
  const rows = await prisma.opsTicket.findMany({
    where: {
      tenantId,
      ...(q ? { OR: [{ title: like(q) }, { code: like(q) }] } : {}),
    },
    select: { id: true, code: true, title: true, status: true },
    orderBy: { createdAt: "desc" },
    take,
  });
  return {
    candidates: rows.map((r) => ({
      id: r.id,
      label: `${r.code} · ${r.title}`,
      sublabel: null,
      status: r.status,
      scope: "tenant" as const,
    })),
    accountScopeApplies: false,
  };
}

/** Valida que la entidad exista EN el tenant (antes de crear el vínculo). */
export async function threadLinkEntityExists(params: {
  tenantId: string;
  type: ThreadLinkEntityType;
  entityId: string;
}): Promise<boolean> {
  const { tenantId, type, entityId } = params;
  try {
    if (type === "installation") {
      return Boolean(
        await prisma.crmInstallation.findFirst({
          where: { tenantId, id: entityId },
          select: { id: true },
        }),
      );
    }
    if (type === "quote") {
      return Boolean(
        await prisma.cpqQuote.findFirst({
          where: { tenantId, id: entityId },
          select: { id: true },
        }),
      );
    }
    if (type === "contract") {
      return Boolean(
        await prisma.document.findFirst({
          where: { tenantId, id: entityId },
          select: { id: true },
        }),
      );
    }
    if (type === "guardia" || type === "postulante") {
      return Boolean(
        await prisma.opsGuardia.findFirst({
          where: { tenantId, id: entityId },
          select: { id: true },
        }),
      );
    }
    if (type === "proveedor") {
      return Boolean(
        await prisma.financeSupplier.findFirst({
          where: { tenantId, id: entityId },
          select: { id: true },
        }),
      );
    }
    if (type === "factura") {
      return Boolean(
        await prisma.financeDte.findFirst({
          where: { tenantId, id: entityId },
          select: { id: true },
        }),
      );
    }
    if (type === "calendar_event") {
      return Boolean(
        await prisma.calendarEvent.findFirst({
          where: { tenantId, id: entityId },
          select: { id: true },
        }),
      );
    }
    return Boolean(
      await prisma.opsTicket.findFirst({
        where: { tenantId, id: entityId },
        select: { id: true },
      }),
    );
  } catch {
    return false;
  }
}

const HREFS: Record<ThreadLinkEntityType, (id: string) => string | null> = {
  installation: (id) => `/crm/installations/${id}`,
  guardia: (id) => `/personas/guardias/${id}`,
  postulante: (id) => `/personas/guardias/${id}`,
  proveedor: () => `/finanzas/proveedores`,
  factura: () => `/finanzas/facturacion`,
  incidente: () => `/ops/tickets`,
  ops_ticket: () => `/ops/tickets`,
  calendar_event: () => `/opai/agenda`,
  quote: (id) => `/crm/cotizaciones/${id}`,
  contract: (id) => `/opai/documentos/${id}`,
};

/** Resuelve los links de un hilo a label + estado + deep-link. */
export async function resolveThreadLinks(params: {
  tenantId: string;
  threadId: string;
}): Promise<ResolvedThreadLink[]> {
  const links = await prisma.crmEmailThreadLink.findMany({
    where: { tenantId: params.tenantId, threadId: params.threadId },
    orderBy: { createdAt: "asc" },
  });
  const resolved: ResolvedThreadLink[] = [];
  for (const link of links) {
    if (!isThreadLinkEntityType(link.entityType)) continue;
    const type = link.entityType;
    let label = link.entityId;
    let status: string | null = null;
    try {
      if (type === "installation") {
        const row = await prisma.crmInstallation.findFirst({
          where: { tenantId: params.tenantId, id: link.entityId },
          select: { name: true, status: true },
        });
        if (row) {
          label = row.name;
          status = row.status;
        }
      } else if (type === "quote") {
        const row = await prisma.cpqQuote.findFirst({
          where: { tenantId: params.tenantId, id: link.entityId },
          select: { code: true, name: true, status: true },
        });
        if (row) {
          label = row.code + (row.name ? ` · ${row.name}` : "");
          status = row.status;
        }
      } else if (type === "contract") {
        const row = await prisma.document.findFirst({
          where: { tenantId: params.tenantId, id: link.entityId },
          select: { title: true, status: true },
        });
        if (row) {
          label = row.title;
          status = row.status;
        }
      } else if (type === "guardia" || type === "postulante") {
        const row = await prisma.opsGuardia.findFirst({
          where: { tenantId: params.tenantId, id: link.entityId },
          select: {
            status: true,
            lifecycleStatus: true,
            persona: { select: { firstName: true, lastName: true } },
          },
        });
        if (row) {
          label = `${row.persona.firstName} ${row.persona.lastName}`.trim();
          status = type === "postulante" ? row.lifecycleStatus : row.status;
        }
      } else if (type === "proveedor") {
        const row = await prisma.financeSupplier.findFirst({
          where: { tenantId: params.tenantId, id: link.entityId },
          select: { name: true },
        });
        if (row) label = row.name;
      } else if (type === "factura") {
        const row = await prisma.financeDte.findFirst({
          where: { tenantId: params.tenantId, id: link.entityId },
          select: { folio: true, receiverName: true, siiStatus: true },
        });
        if (row) {
          label = `Folio ${row.folio} · ${row.receiverName}`;
          status = row.siiStatus;
        }
      } else if (type === "calendar_event") {
        const row = await prisma.calendarEvent.findFirst({
          where: { tenantId: params.tenantId, id: link.entityId },
          select: { title: true, startAt: true, status: true },
        });
        if (row) {
          label = row.title;
          status = row.startAt.toISOString().slice(0, 10);
        }
      } else {
        const row = await prisma.opsTicket.findFirst({
          where: { tenantId: params.tenantId, id: link.entityId },
          select: { code: true, title: true, status: true },
        });
        if (row) {
          label = `${row.code} · ${row.title}`;
          status = row.status;
        }
      }
    } catch {
      /* entidad borrada: mostrar el id crudo */
    }
    resolved.push({
      id: link.id,
      entityType: type,
      entityId: link.entityId,
      linkedVia: link.linkedVia,
      label,
      status,
      href: HREFS[type](link.entityId),
    });
  }
  return resolved;
}
