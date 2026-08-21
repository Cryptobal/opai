import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getPresignedDownloadUrl } from "@/lib/storage";
import { INCIDENTE_TICKET_SLUG } from "./constants";
import { readPublicReport, readValidation } from "./metadata";
import { formatElapsedMinutes, incidenteUiStatus } from "./status";
import { categoryLabel } from "./constants";

export type IncidenteListFilter = "por_validar" | "activos" | "validados" | "abiertos" | "all";

function statusesForFilter(filter: IncidenteListFilter): string[] | undefined {
  if (filter === "por_validar") return ["resolved"];
  if (filter === "activos") return ["open", "in_progress"];
  if (filter === "validados") return ["closed"];
  if (filter === "abiertos") return ["open"];
  return undefined;
}

async function signed(storageKey: string, fileName: string): Promise<string | null> {
  try {
    return await getPresignedDownloadUrl({ storageKey, fileName, expiresInSeconds: 900 });
  } catch {
    return null;
  }
}

export async function listIncidentes(opts: {
  tenantId: string;
  installationIds?: string[] | null;
  filter?: IncidenteListFilter;
  page?: number;
  limit?: number;
}) {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(50, Math.max(1, opts.limit ?? 20));
  if (opts.installationIds && opts.installationIds.length === 0) {
    return { items: [], total: 0, page, limit };
  }
  const statuses = statusesForFilter(opts.filter ?? "all");
  const where: Prisma.OpsTicketWhereInput = {
    tenantId: opts.tenantId,
    ticketType: { slug: INCIDENTE_TICKET_SLUG },
    ...(opts.installationIds ? { installationId: { in: opts.installationIds } } : {}),
    ...(opts.installationIds?.length === 0 ? { id: { in: [] } } : {}),
    ...(statuses ? { status: { in: statuses } } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.opsTicket.findMany({
      where,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        code: true,
        title: true,
        status: true,
        createdAt: true,
        resolvedAt: true,
        closedAt: true,
        resolutionNotes: true,
        slaDueAt: true,
        slaBreached: true,
        metadata: true,
        installationId: true,
        installation: { select: { name: true } },
        guardia: {
          select: { persona: { select: { firstName: true, lastName: true } } },
        },
        attachments: {
          select: { kind: true, fileName: true, contentType: true, storageKey: true, createdAt: true },
          orderBy: { createdAt: "asc" },
        },
        events: {
          where: { type: "status_changed" },
          select: { createdAt: true, data: true },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    prisma.opsTicket.count({ where }),
  ]);

  const items = await Promise.all(
    rows.map(async (row) => {
      const report = readPublicReport(row.metadata);
      const validation = readValidation(row.metadata);
      const attendedAt = row.events.find((e) => {
        const data = e.data as { to?: string } | null;
        return data?.to === "in_progress";
      })?.createdAt;
      const reportPhoto = row.attachments.find(
        (a) => a.kind === "report" && a.contentType.startsWith("image/"),
      );
      const closurePhoto = [...row.attachments]
        .reverse()
        .find((a) => a.kind === "closure" && a.contentType.startsWith("image/"));
      const guardiaName = row.guardia?.persona
        ? [row.guardia.persona.firstName, row.guardia.persona.lastName].filter(Boolean).join(" ").trim()
        : null;
      return {
        id: row.id,
        code: row.code,
        title: row.title,
        status: row.status,
        uiStatus: incidenteUiStatus(row.status),
        category: report?.category ? categoryLabel(report.category) : null,
        installationId: row.installationId,
        installationName: row.installation?.name ?? null,
        createdAt: row.createdAt.toISOString(),
        attendedAt: attendedAt?.toISOString() ?? null,
        respondedIn: attendedAt ? formatElapsedMinutes(row.createdAt, attendedAt) : null,
        resolvedAt: row.resolvedAt?.toISOString() ?? null,
        closedAt: row.closedAt?.toISOString() ?? null,
        resolutionNotes: row.resolutionNotes,
        slaDueAt: row.slaDueAt?.toISOString() ?? null,
        slaBreached: row.slaBreached,
        guardiaName,
        validation: validation
          ? {
              auto: Boolean(validation.auto),
              validatedAt: validation.validatedAt,
              validatedByName: validation.auto ? null : validation.validatedByName ?? "Supervisión",
            }
          : null,
        reportPhotoUrl: reportPhoto ? await signed(reportPhoto.storageKey, reportPhoto.fileName) : null,
        closurePhotoUrl: closurePhoto ? await signed(closurePhoto.storageKey, closurePhoto.fileName) : null,
      };
    }),
  );

  return { items, total, page, limit };
}

export async function getIncidentesKpis(opts: {
  tenantId: string;
  installationIds?: string[] | null;
}) {
  const empty = opts.installationIds?.length === 0;
  const base: Prisma.OpsTicketWhereInput = empty
    ? { id: { in: [] } }
    : {
        tenantId: opts.tenantId,
        ticketType: { slug: INCIDENTE_TICKET_SLUG },
        ...(opts.installationIds ? { installationId: { in: opts.installationIds } } : {}),
      };
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const day30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [abiertos, porValidar, esteMes, slaVencido, recentClosed, responseSample] = await Promise.all([
    prisma.opsTicket.count({ where: { ...base, status: { in: ["open", "in_progress"] } } }),
    prisma.opsTicket.count({ where: { ...base, status: "resolved" } }),
    prisma.opsTicket.count({ where: { ...base, createdAt: { gte: monthStart } } }),
    prisma.opsTicket.count({
      where: { ...base, slaBreached: true, status: { in: ["open", "in_progress", "resolved"] } },
    }),
    prisma.opsTicket.findMany({
      where: { ...base, status: "closed", closedAt: { gte: day30 } },
      select: { metadata: true },
      take: 400,
    }),
    prisma.opsTicketEvent.findMany({
      where: {
        tenantId: opts.tenantId,
        type: "status_changed",
        ticket: base,
      },
      select: { createdAt: true, data: true, ticket: { select: { createdAt: true } } },
      take: 300,
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const human = recentClosed.filter((t) => {
    const v = readValidation(t.metadata);
    return v && !v.auto;
  }).length;
  const pctValidados = recentClosed.length === 0 ? null : Math.round((human / recentClosed.length) * 100);

  const deltas: number[] = [];
  for (const ev of responseSample) {
    const data = ev.data as { to?: string } | null;
    if (data?.to !== "in_progress") continue;
    deltas.push(ev.createdAt.getTime() - ev.ticket.createdAt.getTime());
  }
  const tRespuestaMs = deltas.length ? Math.round(deltas.reduce((a, b) => a + b, 0) / deltas.length) : null;

  return {
    abiertos,
    porValidar,
    esteMes,
    slaVencido,
    tRespuestaMs,
    tRespuestaLabel: tRespuestaMs == null ? "—" : formatElapsedMinutes(new Date(0), new Date(tRespuestaMs)),
    pctValidados30d: pctValidados,
  };
}
