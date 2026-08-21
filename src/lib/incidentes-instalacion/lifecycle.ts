import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recordTicketEvent } from "@/lib/tickets-events";
import { MIN_CLOSURE_COMMENT_CHARS, AUTO_CLOSE_HOURS } from "./constants";
import { IncidenteError } from "./errors";
import { mergeTicketMetadata } from "./metadata";
import { canIncidenteTransitionTo } from "./status";
import { isIncidenteTicketType } from "./type-guard";
import { sanitizeUploadFileName } from "./tokens";
import { notifyIncidenteCerrado, notifyIncidenteRechazado, notifyIncidenteValidado } from "./notify";
import type { UploadedReportFile } from "./create-public";

const TICKET_SELECT = {
  id: true,
  tenantId: true,
  code: true,
  title: true,
  status: true,
  installationId: true,
  guardiaId: true,
  assignedTo: true,
  metadata: true,
  resolutionNotes: true,
  csatToken: true,
  ticketType: { select: { slug: true } },
} satisfies Prisma.OpsTicketSelect;

type LoadedTicket = Prisma.OpsTicketGetPayload<{ select: typeof TICKET_SELECT }>;

async function loadIncidente(
  tenantId: string,
  ticketId: string,
  installationId?: string | null,
): Promise<LoadedTicket> {
  const ticket = await prisma.opsTicket.findFirst({
    where: {
      id: ticketId,
      tenantId,
      ...(installationId ? { installationId } : {}),
    },
    select: TICKET_SELECT,
  });
  if (!ticket) throw new IncidenteError("NOT_FOUND", "Incidente no encontrado.", 404);
  if (!isIncidenteTicketType(ticket.ticketType?.slug)) {
    throw new IncidenteError("VALIDATION_ERROR", "Este ticket no es un incidente en terreno.", 422);
  }
  return ticket;
}

async function csatPatch(ticket: LoadedTicket): Promise<Prisma.OpsTicketUpdateInput> {
  if (ticket.csatToken) return {};
  try {
    const { generateCsatToken, defaultCsatExpiry } = await import("@/lib/tickets-csat");
    return { csatToken: generateCsatToken(), csatTokenExp: defaultCsatExpiry() };
  } catch {
    return {};
  }
}

export async function atenderIncidente(opts: {
  tenantId: string;
  ticketId: string;
  actorId: string;
  guardiaId?: string | null;
  actorName?: string | null;
  installationId?: string | null;
}): Promise<{ id: string; status: string }> {
  const ticket = await loadIncidente(opts.tenantId, opts.ticketId, opts.installationId);
  if (!canIncidenteTransitionTo(ticket.status as never, "in_progress")) {
    throw new IncidenteError(
      "VALIDATION_ERROR",
      `No se puede atender un incidente en estado ${ticket.status}.`,
      422,
    );
  }
  const now = new Date();
  const updated = await prisma.opsTicket.update({
    where: { id: ticket.id },
    data: {
      status: "in_progress",
      ...(opts.guardiaId ? { guardiaId: opts.guardiaId } : {}),
      metadata: mergeTicketMetadata(ticket.metadata, {
        atencion: {
          attendedAt: now.toISOString(),
          attendedBy: opts.actorId,
          attendedByName: opts.actorName ?? null,
        },
      }) as Prisma.InputJsonValue,
    },
    select: { id: true, status: true },
  });
  await recordTicketEvent({
    tenantId: opts.tenantId,
    ticketId: ticket.id,
    type: "status_changed",
    actorId: opts.actorId,
    data: { from: ticket.status, to: "in_progress", source: "incidente" },
  });
  return updated;
}

export async function cerrarIncidente(opts: {
  tenantId: string;
  ticketId: string;
  actorId: string;
  comment: string;
  files?: UploadedReportFile[];
  guardiaId?: string | null;
  installationId?: string | null;
}): Promise<{ id: string; status: string }> {
  const ticket = await loadIncidente(opts.tenantId, opts.ticketId, opts.installationId);
  if (!canIncidenteTransitionTo(ticket.status as never, "resolved")) {
    throw new IncidenteError(
      "VALIDATION_ERROR",
      "El incidente debe estar en atención para cerrarse.",
      422,
    );
  }
  const comment = opts.comment.trim();
  if (comment.length < MIN_CLOSURE_COMMENT_CHARS) {
    throw new IncidenteError(
      "VALIDATION_ERROR",
      "El cierre requiere un comentario de al menos 6 caracteres.",
      422,
    );
  }
  const files = opts.files ?? [];
  const existingClosure = await prisma.opsTicketAttachment.count({
    where: { ticketId: ticket.id, tenantId: opts.tenantId, kind: "closure" },
  });
  if (existingClosure + files.length < 1) {
    throw new IncidenteError(
      "VALIDATION_ERROR",
      "El cierre requiere al menos una foto de evidencia.",
      422,
    );
  }

  if (files.length > 0) {
    await prisma.opsTicketAttachment.createMany({
      data: files.map((f) => ({
        tenantId: opts.tenantId,
        ticketId: ticket.id,
        fileName: sanitizeUploadFileName(f.fileName),
        fileSize: f.fileSize,
        contentType: f.contentType,
        storageKey: f.storageKey,
        uploadedBy: opts.actorId,
        kind: "closure",
      })),
    });
  }

  const now = new Date();
  const updated = await prisma.opsTicket.update({
    where: { id: ticket.id },
    data: {
      status: "resolved",
      resolvedAt: now,
      resolutionNotes: comment,
      ...(opts.guardiaId ? { guardiaId: opts.guardiaId } : {}),
      ...(await csatPatch(ticket)),
    },
    select: { id: true, status: true },
  });
  await recordTicketEvent({
    tenantId: opts.tenantId,
    ticketId: ticket.id,
    type: "status_changed",
    actorId: opts.actorId,
    data: { from: ticket.status, to: "resolved", source: "incidente" },
  });
  notifyIncidenteCerrado({
    id: ticket.id,
    code: ticket.code,
    title: ticket.title,
    tenantId: ticket.tenantId,
    installationId: ticket.installationId,
    guardiaId: opts.guardiaId ?? ticket.guardiaId,
  }).catch((err) => console.error("[incidentes] notify cerrado:", err));
  return updated;
}

export async function validarIncidente(opts: {
  tenantId: string;
  ticketId: string;
  actorId: string;
  actorName: string;
}): Promise<{ id: string; status: string }> {
  const ticket = await loadIncidente(opts.tenantId, opts.ticketId);
  if (ticket.status === "closed") {
    throw new IncidenteError("DUPLICATE", "Este incidente ya fue validado.", 409, {
      status: ticket.status,
    });
  }
  if (ticket.status !== "resolved") {
    throw new IncidenteError(
      "VALIDATION_ERROR",
      "Solo se puede validar un incidente cerrado pendiente de revisión.",
      422,
    );
  }
  const now = new Date();
  const result = await prisma.opsTicket.updateMany({
    where: { id: ticket.id, tenantId: opts.tenantId, status: "resolved" },
    data: {
      status: "closed",
      closedAt: now,
      metadata: mergeTicketMetadata(ticket.metadata, {
        validation: {
          validatedBy: opts.actorId,
          validatedByName: opts.actorName,
          validatedAt: now.toISOString(),
          auto: false,
        },
      }) as Prisma.InputJsonValue,
      ...(await csatPatch(ticket)),
    },
  });
  if (result.count === 0) {
    const current = await prisma.opsTicket.findFirst({
      where: { id: ticket.id, tenantId: opts.tenantId },
      select: { status: true, metadata: true },
    });
    throw new IncidenteError("DUPLICATE", "Este incidente ya fue validado.", 409, {
      status: current?.status ?? "closed",
    });
  }
  await recordTicketEvent({
    tenantId: opts.tenantId,
    ticketId: ticket.id,
    type: "incidente_validado",
    actorId: opts.actorId,
    data: { validatedByName: opts.actorName },
  });
  await recordTicketEvent({
    tenantId: opts.tenantId,
    ticketId: ticket.id,
    type: "status_changed",
    actorId: opts.actorId,
    data: { from: "resolved", to: "closed", source: "incidente" },
  });
  notifyIncidenteValidado(
    {
      id: ticket.id,
      code: ticket.code,
      title: ticket.title,
      tenantId: ticket.tenantId,
      installationId: ticket.installationId,
      guardiaId: ticket.guardiaId,
    },
    opts.actorName,
  ).catch((err) => console.error("[incidentes] notify validado:", err));
  return { id: ticket.id, status: "closed" };
}

export async function rechazarIncidente(opts: {
  tenantId: string;
  ticketId: string;
  actorId: string;
  actorName: string;
  reason: string;
}): Promise<{ id: string; status: string }> {
  const ticket = await loadIncidente(opts.tenantId, opts.ticketId);
  const reason = opts.reason.trim();
  if (reason.length < 4) {
    throw new IncidenteError("VALIDATION_ERROR", "El rechazo requiere un motivo.", 422);
  }
  if (ticket.status === "closed") {
    throw new IncidenteError(
      "VALIDATION_ERROR",
      "El incidente ya está cerrado. Puedes dejar un comentario.",
      422,
    );
  }
  if (ticket.status !== "resolved") {
    throw new IncidenteError(
      "VALIDATION_ERROR",
      "Solo se puede devolver un incidente pendiente de validación.",
      422,
    );
  }
  const result = await prisma.opsTicket.updateMany({
    where: { id: ticket.id, tenantId: opts.tenantId, status: "resolved" },
    data: {
      status: "in_progress",
      resolvedAt: null,
      resolutionNotes: null,
    },
  });
  if (result.count === 0) {
    throw new IncidenteError("DUPLICATE", "El incidente ya no está pendiente de validación.", 409);
  }
  await prisma.opsTicketComment.create({
    data: {
      ticketId: ticket.id,
      userId: opts.actorId,
      body: `Devuelto al guardia: ${reason}`,
      isInternal: true,
    },
  });
  await recordTicketEvent({
    tenantId: opts.tenantId,
    ticketId: ticket.id,
    type: "incidente_rechazado",
    actorId: opts.actorId,
    data: { reason, actorName: opts.actorName },
  });
  await recordTicketEvent({
    tenantId: opts.tenantId,
    ticketId: ticket.id,
    type: "status_changed",
    actorId: opts.actorId,
    data: { from: "resolved", to: "in_progress", source: "incidente_rechazo" },
  });
  notifyIncidenteRechazado(
    {
      id: ticket.id,
      code: ticket.code,
      title: ticket.title,
      tenantId: ticket.tenantId,
      installationId: ticket.installationId,
      guardiaId: ticket.guardiaId,
    },
    reason,
  ).catch((err) => console.error("[incidentes] notify rechazado:", err));
  return { id: ticket.id, status: "in_progress" };
}

export async function autoCerrarIncidentes(limit = 200): Promise<{ closed: number }> {
  const cutoff = new Date(Date.now() - AUTO_CLOSE_HOURS * 60 * 60 * 1000);
  const due = await prisma.opsTicket.findMany({
    where: {
      status: "resolved",
      resolvedAt: { lte: cutoff },
      ticketType: { slug: "incidente-instalacion" },
    },
    select: TICKET_SELECT,
    take: Math.min(200, Math.max(1, limit)),
  });
  let closed = 0;
  for (const ticket of due) {
    const now = new Date();
    const result = await prisma.opsTicket.updateMany({
      where: { id: ticket.id, status: "resolved" },
      data: {
        status: "closed",
        closedAt: now,
        metadata: mergeTicketMetadata(ticket.metadata, {
          validation: { auto: true, validatedAt: now.toISOString() },
        }) as Prisma.InputJsonValue,
        ...(await csatPatch(ticket)),
      },
    });
    if (result.count === 0) continue;
    await recordTicketEvent({
      tenantId: ticket.tenantId,
      ticketId: ticket.id,
      type: "incidente_auto_closed",
      actorId: "cron",
      data: { hours: AUTO_CLOSE_HOURS },
    });
    closed += 1;
  }
  return { closed };
}
