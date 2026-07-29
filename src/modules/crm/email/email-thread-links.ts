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

/** Etiquetas en español para los 10 tipos del registry. */
export const THREAD_LINK_TYPE_LABELS: Record<ThreadLinkEntityType, string> = {
  installation: "Instalación",
  quote: "Cotización",
  contract: "Contrato",
  ops_ticket: "Ticket",
  incidente: "Incidente",
  calendar_event: "Evento de agenda",
  factura: "Factura",
  guardia: "Guardia",
  postulante: "Postulante",
  proveedor: "Proveedor",
};

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
  scope: "account" | "tenant" | "suggested";
  /** Presente en búsquedas multi-tipo. */
  entityType?: string;
  signal?: string | null;
  confidence?: "alta" | "media" | null;
};

/** Tipos del buscador único (omnibox), incluyen deal/account/contact. */
export const OMNIBOX_ENTITY_TYPES = [
  "account",
  "contact",
  "deal",
  "quote",
  "installation",
  "contract",
] as const;
export type OmniboxEntityType = (typeof OMNIBOX_ENTITY_TYPES)[number];

export function isOmniboxEntityType(v: string): v is OmniboxEntityType {
  return (OMNIBOX_ENTITY_TYPES as readonly string[]).includes(v);
}

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
  /** Si false, el hilo no aparece en la ficha de la entidad. */
  visibleOnEntity: boolean;
  /** true cuando la entidad ya no existe (vínculo huérfano). */
  orphan: boolean;
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

/**
 * Búsqueda multi-tipo para el omnibox. Reutiliza las ramas por tipo del
 * registry y suma account/contact/deal.
 */
export async function searchThreadLinkCandidatesMulti(params: {
  tenantId: string;
  types: string[];
  q: string;
  accountId?: string | null;
  limit?: number;
}): Promise<ThreadLinkSearchResult> {
  const { tenantId } = params;
  const accountId = params.accountId?.trim() || null;
  const q = params.q.trim();
  const perType = Math.min(params.limit ?? 8, 15);
  const types = params.types.map((t) => t.trim()).filter(Boolean);
  const out: ThreadLinkCandidate[] = [];
  let accountScopeApplies = false;

  async function pushLinkType(type: ThreadLinkEntityType) {
    const r = await searchThreadLinkCandidates({
      tenantId,
      type,
      q,
      accountId,
      limit: perType,
    });
    if (r.accountScopeApplies) accountScopeApplies = true;
    for (const c of r.candidates) {
      out.push({ ...c, entityType: type });
    }
  }

  for (const type of types) {
    if (type === "account") {
      const rows = await prisma.crmAccount.findMany({
        where: {
          tenantId,
          ...(q
            ? {
                OR: [
                  { name: like(q) },
                  { rut: like(q) },
                ],
              }
            : {}),
        },
        select: { id: true, name: true, rut: true },
        orderBy: { name: "asc" },
        take: perType,
      });
      for (const r of rows) {
        out.push({
          id: r.id,
          entityType: "account",
          label: r.name,
          sublabel: r.rut,
          status: null,
          scope: "tenant",
        });
      }
      continue;
    }
    if (type === "contact") {
      const rows = await prisma.crmContact.findMany({
        where: {
          tenantId,
          ...(accountId ? { accountId } : {}),
          ...(q
            ? {
                OR: [
                  { firstName: like(q) },
                  { lastName: like(q) },
                  { email: like(q) },
                ],
              }
            : {}),
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          accountId: true,
          account: { select: { name: true } },
        },
        orderBy: { firstName: "asc" },
        take: perType,
      });
      if (accountId) accountScopeApplies = true;
      for (const r of rows) {
        out.push({
          id: r.id,
          entityType: "contact",
          label: `${r.firstName} ${r.lastName}`.trim(),
          sublabel: r.email ?? r.account?.name ?? null,
          status: null,
          scope: accountId && r.accountId === accountId ? "account" : "tenant",
        });
      }
      continue;
    }
    if (type === "deal") {
      const rows = await prisma.crmDeal.findMany({
        where: {
          tenantId,
          ...(accountId ? { accountId } : {}),
          status: "open",
          ...(q ? { title: like(q) } : {}),
        },
        select: {
          id: true,
          title: true,
          status: true,
          accountId: true,
          stage: { select: { name: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: perType,
      });
      if (accountId) accountScopeApplies = true;
      for (const r of rows) {
        out.push({
          id: r.id,
          entityType: "deal",
          label: r.title,
          sublabel: r.stage?.name ?? null,
          status: r.status,
          scope: accountId && r.accountId === accountId ? "account" : "tenant",
        });
      }
      continue;
    }
    if (isThreadLinkEntityType(type)) {
      await pushLinkType(type);
    }
  }

  return {
    candidates: sortByScope(out).slice(0, Math.min(params.limit ?? 40, 60)),
    accountScopeApplies,
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

export const HREFS: Record<ThreadLinkEntityType, (id: string) => string | null> = {
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

/** Deep-links públicos para la cadena de contexto. */
export function hrefForThreadEntity(
  entityType: string,
  id: string,
): string | null {
  if (entityType === "account") return `/crm/accounts/${id}`;
  if (entityType === "deal") return `/crm/deals/${id}`;
  if (entityType === "contact") return `/crm/contacts/${id}`;
  if (isThreadLinkEntityType(entityType)) return HREFS[entityType](id);
  return null;
}

type EntityMeta = { label: string; status: string | null };

/** Carga metadatos de entidades agrupados por tipo (1 consulta por tipo). */
async function loadEntityMetaByType(
  tenantId: string,
  type: ThreadLinkEntityType,
  ids: string[],
): Promise<Map<string, EntityMeta>> {
  const map = new Map<string, EntityMeta>();
  if (ids.length === 0) return map;
  try {
    if (type === "installation") {
      const rows = await prisma.crmInstallation.findMany({
        where: { tenantId, id: { in: ids } },
        select: { id: true, name: true, status: true },
      });
      for (const r of rows) map.set(r.id, { label: r.name, status: r.status });
    } else if (type === "quote") {
      const rows = await prisma.cpqQuote.findMany({
        where: { tenantId, id: { in: ids } },
        select: { id: true, code: true, name: true, status: true },
      });
      for (const r of rows) {
        map.set(r.id, {
          label: r.code + (r.name ? ` · ${r.name}` : ""),
          status: r.status,
        });
      }
    } else if (type === "contract") {
      const rows = await prisma.document.findMany({
        where: { tenantId, id: { in: ids } },
        select: { id: true, title: true, status: true },
      });
      for (const r of rows) map.set(r.id, { label: r.title, status: r.status });
    } else if (type === "guardia" || type === "postulante") {
      const rows = await prisma.opsGuardia.findMany({
        where: { tenantId, id: { in: ids } },
        select: {
          id: true,
          status: true,
          lifecycleStatus: true,
          persona: { select: { firstName: true, lastName: true } },
        },
      });
      for (const r of rows) {
        map.set(r.id, {
          label: `${r.persona.firstName} ${r.persona.lastName}`.trim(),
          status: type === "postulante" ? r.lifecycleStatus : r.status,
        });
      }
    } else if (type === "proveedor") {
      const rows = await prisma.financeSupplier.findMany({
        where: { tenantId, id: { in: ids } },
        select: { id: true, name: true },
      });
      for (const r of rows) map.set(r.id, { label: r.name, status: null });
    } else if (type === "factura") {
      const rows = await prisma.financeDte.findMany({
        where: { tenantId, id: { in: ids } },
        select: { id: true, folio: true, receiverName: true, siiStatus: true },
      });
      for (const r of rows) {
        map.set(r.id, {
          label: `Folio ${r.folio} · ${r.receiverName}`,
          status: r.siiStatus,
        });
      }
    } else if (type === "calendar_event") {
      const rows = await prisma.calendarEvent.findMany({
        where: { tenantId, id: { in: ids } },
        select: { id: true, title: true, startAt: true },
      });
      for (const r of rows) {
        map.set(r.id, {
          label: r.title,
          status: r.startAt.toISOString().slice(0, 10),
        });
      }
    } else {
      // ops_ticket | incidente
      const rows = await prisma.opsTicket.findMany({
        where: { tenantId, id: { in: ids } },
        select: { id: true, code: true, title: true, status: true },
      });
      for (const r of rows) {
        map.set(r.id, { label: `${r.code} · ${r.title}`, status: r.status });
      }
    }
  } catch {
    /* tipo no disponible en este tenant / schema: tratar como huérfanos */
  }
  return map;
}

/** Resuelve los links de un hilo a label + estado + deep-link. */
export async function resolveThreadLinks(params: {
  tenantId: string;
  threadId: string;
}): Promise<ResolvedThreadLink[]> {
  const links = await prisma.crmEmailThreadLink.findMany({
    where: { tenantId: params.tenantId, threadId: params.threadId },
    orderBy: { createdAt: "asc" },
  });

  const byType = new Map<ThreadLinkEntityType, string[]>();
  for (const link of links) {
    if (!isThreadLinkEntityType(link.entityType)) continue;
    const list = byType.get(link.entityType) ?? [];
    list.push(link.entityId);
    byType.set(link.entityType, list);
  }

  const metaByType = new Map<ThreadLinkEntityType, Map<string, EntityMeta>>();
  await Promise.all(
    [...byType.entries()].map(async ([type, ids]) => {
      metaByType.set(type, await loadEntityMetaByType(params.tenantId, type, [...new Set(ids)]));
    }),
  );

  const resolved: ResolvedThreadLink[] = [];
  for (const link of links) {
    if (!isThreadLinkEntityType(link.entityType)) continue;
    const type = link.entityType;
    const meta = metaByType.get(type)?.get(link.entityId);
    const orphan = !meta;
    resolved.push({
      id: link.id,
      entityType: type,
      entityId: link.entityId,
      linkedVia: link.linkedVia,
      label: meta?.label ?? "Entidad eliminada",
      status: meta?.status ?? null,
      href: orphan ? null : HREFS[type](link.entityId),
      visibleOnEntity: link.visibleOnEntity,
      orphan,
    });
  }
  return resolved;
}
