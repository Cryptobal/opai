import { prisma } from "@/lib/prisma";
import { getPresignedDownloadUrl } from "@/lib/storage";
import { IncidenteError } from "./errors";
import { readPublicReport, readValidation } from "./metadata";
import { formatElapsedMinutes, incidenteUiStatus } from "./status";
import { categoryLabel } from "./constants";

export type FollowTimelineStep = {
  key: string;
  label: string;
  at: string | null;
  guardName?: string | null;
  elapsedLabel?: string | null;
  comment?: string | null;
  photoUrl?: string | null;
};

const TIMELINE_EVENT_TYPES = [
  "status_changed",
  "ticket_created",
  "incidente_validado",
  "incidente_auto_closed",
];

async function signedMedia(storageKey: string, fileName: string): Promise<string | null> {
  try {
    return await getPresignedDownloadUrl({
      storageKey,
      fileName,
      expiresInSeconds: 900,
    });
  } catch {
    return null;
  }
}

async function loadTimelineTicket(where: {
  publicFollowToken?: string;
  id?: string;
  tenantId?: string;
}) {
  const ticket = await prisma.opsTicket.findFirst({
    where,
    select: {
      id: true,
      code: true,
      title: true,
      status: true,
      description: true,
      createdAt: true,
      resolvedAt: true,
      closedAt: true,
      resolutionNotes: true,
      metadata: true,
      installationId: true,
      tenantId: true,
      assignedTo: true,
      guardiaId: true,
      ticketType: { select: { slug: true, name: true } },
      attachments: {
        select: {
          kind: true,
          fileName: true,
          contentType: true,
          storageKey: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
      },
      events: {
        where: { type: { in: TIMELINE_EVENT_TYPES } },
        select: { type: true, createdAt: true, data: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!ticket) {
    throw new IncidenteError("NOT_FOUND", "No encontramos este reporte.", 404);
  }
  return ticket;
}

export async function getPublicFollowTimeline(followToken: string) {
  if (!followToken || followToken.length < 16) {
    throw new IncidenteError("NOT_FOUND", "No encontramos este reporte.", 404);
  }
  const ticket = await loadTimelineTicket({ publicFollowToken: followToken });
  return serializeTimeline(ticket);
}

export async function getIncidenteTimelineById(opts: { tenantId: string; ticketId: string }) {
  const ticket = await loadTimelineTicket({ id: opts.ticketId, tenantId: opts.tenantId });
  return serializeTimeline(ticket);
}

async function serializeTimeline(
  ticket: Awaited<ReturnType<typeof loadTimelineTicket>>,
) {

  const report = readPublicReport(ticket.metadata);
  const validation = readValidation(ticket.metadata);
  const ui = incidenteUiStatus(ticket.status);

  const reportFiles = ticket.attachments.filter((a) => a.kind === "report");
  const closureFiles = ticket.attachments.filter((a) => a.kind === "closure");

  const reportMedia = await Promise.all(
    reportFiles.slice(0, 5).map(async (f) => ({
      fileName: f.fileName,
      contentType: f.contentType,
      url: await signedMedia(f.storageKey, f.fileName),
      createdAt: f.createdAt.toISOString(),
    })),
  );
  const closureMedia = await Promise.all(
    closureFiles.slice(0, 3).map(async (f) => ({
      fileName: f.fileName,
      contentType: f.contentType,
      url: await signedMedia(f.storageKey, f.fileName),
      createdAt: f.createdAt.toISOString(),
    })),
  );

  let guardiaName: string | null = null;
  if (ticket.guardiaId) {
    const g = await prisma.opsGuardia.findUnique({
      where: { id: ticket.guardiaId },
      select: { persona: { select: { firstName: true, lastName: true } } },
    });
    if (g?.persona) {
      const first = g.persona.firstName?.trim() ?? "";
      guardiaName = first || "Guardia en turno";
    }
  }

  const attendedAt = ticket.events.find((e) => {
    const data = e.data as { to?: string } | null;
    return e.type === "status_changed" && data?.to === "in_progress";
  })?.createdAt;

  const respondedIn = attendedAt
    ? formatElapsedMinutes(ticket.createdAt, attendedAt)
    : null;

  const reportMediaSafe = reportMedia.filter((m) => m.url);
  const closureMediaSafe = closureMedia.filter((m) => m.url);
  const validationView = validation
    ? {
        auto: Boolean(validation.auto),
        validatedAt: validation.validatedAt,
        validatedByName: validation.auto ? null : validation.validatedByName ?? "Supervisión",
      }
    : null;

  const resolutionNotes = ticket.status === "open" ? null : ticket.resolutionNotes;

  const steps: FollowTimelineStep[] = [
    {
      key: "reportado",
      label: "Reportado",
      at: ticket.createdAt.toISOString(),
      photoUrl: reportMediaSafe.find((m) => m.contentType.startsWith("image/") && m.url)?.url ?? null,
    },
    {
      key: "atencion",
      label: "En atención",
      at: attendedAt?.toISOString() ?? null,
      guardName: guardiaName,
      elapsedLabel: respondedIn ? `a los ${respondedIn}` : null,
    },
    {
      key: "resuelto",
      label: "Resuelto",
      at: ticket.resolvedAt?.toISOString() ?? null,
      comment: resolutionNotes,
      photoUrl: closureMediaSafe.find((m) => m.contentType.startsWith("image/") && m.url)?.url ?? null,
    },
    {
      key: "validado",
      label: validationView?.auto ? "Cierre confirmado" : "Validado por supervisión",
      at: ticket.closedAt?.toISOString() ?? validationView?.validatedAt ?? null,
      guardName: validationView?.auto ? null : validationView?.validatedByName ?? null,
    },
  ];

  return {
    code: ticket.code,
    status: ticket.status,
    uiStatus: ui,
    category: report?.category ? categoryLabel(report.category) : null,
    title: ticket.title,
    description: ticket.description,
    installationName: ticket.installationId
      ? (
          await prisma.crmInstallation.findFirst({
            where: { id: ticket.installationId, tenantId: ticket.tenantId },
            select: { name: true },
          })
        )?.name ?? null
      : null,
    createdAt: ticket.createdAt.toISOString(),
    attendedAt: attendedAt?.toISOString() ?? null,
    respondedIn,
    resolvedAt: ticket.resolvedAt?.toISOString() ?? null,
    closedAt: ticket.closedAt?.toISOString() ?? null,
    guardiaName,
    resolutionNotes,
    validation: validationView,
    reportMedia: reportMediaSafe,
    closureMedia: closureMediaSafe,
    steps,
  };
}

export type PublicFollowTimeline = Awaited<ReturnType<typeof getPublicFollowTimeline>>;
