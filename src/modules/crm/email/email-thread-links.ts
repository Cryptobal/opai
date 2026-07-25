/**
 * Vinculación polimórfica hilo↔entidad operacional (O01-O04, Prompt D et. 4).
 *
 * Registry por tipo de entidad: búsqueda (para el picker), resolución
 * (label + estado + deep-link para el panel) y validación de existencia
 * (tenant-scoped SIEMPRE). La tabla crm.email_thread_links guarda
 * (thread, entity_type, entity_id) unique + linked_via manual|ai|rule.
 *
 * Nota de diseño: se usa el polimórfico también para instalación (no una FK
 * directa) — el hilo ya tiene FKs comerciales (account/deal/lead) y las
 * entidades operacionales conviven mejor en una sola tabla auditable con
 * `linked_via`; una FK extra por entidad no escala a 7 tipos.
 */
import { prisma } from "@/lib/prisma";

export const THREAD_LINK_ENTITY_TYPES = [
  "installation",
  "guardia",
  "postulante",
  "proveedor",
  "factura",
  "incidente",
  // Lector v3 (Bloques 6/7): ticket creado desde el correo y reunión agendada.
  "ops_ticket",
  "calendar_event",
] as const;
export type ThreadLinkEntityType = (typeof THREAD_LINK_ENTITY_TYPES)[number];

export function isThreadLinkEntityType(v: string): v is ThreadLinkEntityType {
  return (THREAD_LINK_ENTITY_TYPES as readonly string[]).includes(v);
}

export type ThreadLinkCandidate = {
  id: string;
  label: string;
  sublabel: string | null;
  status: string | null;
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

/** Búsqueda de candidatos por tipo (para el picker del panel). */
export async function searchThreadLinkCandidates(params: {
  tenantId: string;
  type: ThreadLinkEntityType;
  q: string;
  limit?: number;
}): Promise<ThreadLinkCandidate[]> {
  const { tenantId, type } = params;
  const q = params.q.trim();
  const take = Math.min(params.limit ?? 10, 20);
  if (type === "installation") {
    const rows = await prisma.crmInstallation.findMany({
      where: { tenantId, ...(q ? { name: like(q) } : {}) },
      select: { id: true, name: true, commune: true, status: true },
      orderBy: { name: "asc" },
      take,
    });
    return rows.map((r) => ({
      id: r.id,
      label: r.name,
      sublabel: r.commune,
      status: r.status,
    }));
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
    return rows.map((r) => ({
      id: r.id,
      label: `${r.persona.firstName} ${r.persona.lastName}`.trim(),
      sublabel: r.persona.rut,
      status: type === "postulante" ? r.lifecycleStatus : r.status,
    }));
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
    return rows.map((r) => ({ id: r.id, label: r.name, sublabel: r.rut, status: null }));
  }
  if (type === "factura") {
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
        siiStatus: true,
        dueDate: true,
      },
      orderBy: { date: "desc" },
      take,
    });
    return rows.map((r) => ({
      id: r.id,
      label: `Folio ${r.folio} · ${r.receiverName}`,
      sublabel: r.dueDate ? `vence ${r.dueDate.toISOString().slice(0, 10)}` : null,
      status: r.siiStatus,
    }));
  }
  if (type === "calendar_event") {
    const rows = await prisma.calendarEvent.findMany({
      where: { tenantId, deletedAt: null, ...(q ? { title: like(q) } : {}) },
      select: { id: true, title: true, startAt: true, status: true },
      orderBy: { startAt: "desc" },
      take,
    });
    return rows.map((r) => ({
      id: r.id,
      label: r.title,
      sublabel: r.startAt.toISOString().slice(0, 10),
      status: r.status,
    }));
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
  return rows.map((r) => ({
    id: r.id,
    label: `${r.code} · ${r.title}`,
    sublabel: null,
    status: r.status,
  }));
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
        await prisma.crmInstallation.findFirst({ where: { tenantId, id: entityId }, select: { id: true } }),
      );
    }
    if (type === "guardia" || type === "postulante") {
      return Boolean(
        await prisma.opsGuardia.findFirst({ where: { tenantId, id: entityId }, select: { id: true } }),
      );
    }
    if (type === "proveedor") {
      return Boolean(
        await prisma.financeSupplier.findFirst({ where: { tenantId, id: entityId }, select: { id: true } }),
      );
    }
    if (type === "factura") {
      return Boolean(
        await prisma.financeDte.findFirst({ where: { tenantId, id: entityId }, select: { id: true } }),
      );
    }
    if (type === "calendar_event") {
      return Boolean(
        await prisma.calendarEvent.findFirst({ where: { tenantId, id: entityId }, select: { id: true } }),
      );
    }
    return Boolean(
      await prisma.opsTicket.findFirst({ where: { tenantId, id: entityId }, select: { id: true } }),
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
