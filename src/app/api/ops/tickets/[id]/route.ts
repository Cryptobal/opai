import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import { isAdminRole } from "@/lib/access";
import type { Ticket, TicketApproval, SlaExtensionEntry } from "@/lib/tickets";
import {
  ticketSupervisionFindingInclude,
  pickTicketFinding,
} from "@/lib/tickets-finding";

type Params = { id: string };

/* ── Prisma includes for full detail ─────────────────────────── */

const ticketDetailIncludes = {
  ticketType: { select: { id: true, name: true, slug: true, origin: true } },
  guardia: {
    select: {
      id: true,
      code: true,
      persona: { select: { firstName: true, lastName: true, rut: true } },
    },
  },
  approvals: { orderBy: { stepOrder: "asc" as const } },
  comments: { orderBy: { createdAt: "desc" as const } },
  ...ticketSupervisionFindingInclude,
  _count: { select: { comments: true, approvals: true } },
};

/* ── Mapper ──────────────────────────────────────────────────── */

function mapApproval(a: any): TicketApproval {
  return {
    id: a.id,
    ticketId: a.ticketId,
    stepOrder: a.stepOrder,
    stepLabel: a.stepLabel,
    approverType: a.approverType,
    approverGroupId: a.approverGroupId,
    approverGroupName: null,
    approverUserId: a.approverUserId,
    approverUserName: null,
    decision: a.decision,
    decidedById: a.decidedById,
    decidedByName: null,
    comment: a.comment,
    decidedAt: a.decidedAt instanceof Date ? a.decidedAt.toISOString() : a.decidedAt,
    createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : a.createdAt,
  };
}

function mapTicketDetail(t: any): Ticket {
  const guardiaName =
    t.guardia?.persona
      ? `${t.guardia.persona.firstName} ${t.guardia.persona.lastName}`
      : null;

  return {
    id: t.id,
    tenantId: t.tenantId,
    code: t.code,
    ticketTypeId: t.ticketTypeId,
    ticketType: t.ticketType ?? null,
    categoryId: t.ticketTypeId ?? "",
    status: t.status,
    priority: t.priority,
    title: t.title,
    description: t.description,
    assignedTeam: t.assignedTeam,
    assignedTo: t.assignedTo,
    installationId: t.installationId,
    source: t.source,
    sourceLogId: null,
    sourceGuardEventId: t.sourceGuardEventId,
    guardiaId: t.guardiaId,
    guardiaName,
    guardiaRut: t.guardia?.persona?.rut ?? null,
    guardiaCode: t.guardia?.code ?? null,
    reportedBy: t.reportedBy,
    slaDueAt: t.slaDueAt instanceof Date ? t.slaDueAt.toISOString() : t.slaDueAt,
    slaBreached: t.slaBreached,
    slaPausedAt: t.slaPausedAt instanceof Date ? t.slaPausedAt.toISOString() : t.slaPausedAt ?? null,
    slaPausedReason: t.slaPausedReason ?? null,
    slaPausedTotalMs: Number(t.slaPausedTotalMs ?? 0),
    slaExtensions: (t.slaExtensions as SlaExtensionEntry[] | null) ?? null,
    snoozedUntil: t.snoozedUntil instanceof Date ? t.snoozedUntil.toISOString() : t.snoozedUntil ?? null,
    lastSlaNotifiedAt: t.lastSlaNotifiedAt instanceof Date ? t.lastSlaNotifiedAt.toISOString() : t.lastSlaNotifiedAt ?? null,
    resolvedAt: t.resolvedAt instanceof Date ? t.resolvedAt.toISOString() : t.resolvedAt,
    closedAt: t.closedAt instanceof Date ? t.closedAt.toISOString() : t.closedAt,
    resolutionNotes: t.resolutionNotes,
    tags: t.tags ?? [],
    currentApprovalStep: t.currentApprovalStep,
    approvalStatus: t.approvalStatus,
    approvals: (t.approvals ?? []).map(mapApproval),
    createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : t.createdAt,
    updatedAt: t.updatedAt instanceof Date ? t.updatedAt.toISOString() : t.updatedAt,
    commentsCount: t._count?.comments ?? 0,
    attachmentsCount: 0,
    finding: pickTicketFinding(t),
  };
}

/* ── GET /api/ops/tickets/[id] ───────────────────────────────── */

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;

    const ticket = await prisma.opsTicket.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: ticketDetailIncludes,
    });

    if (!ticket) {
      return NextResponse.json(
        { success: false, error: "Ticket no encontrado" },
        { status: 404 },
      );
    }

    // Resolve approver/decider names
    const approvalRows = ticket.approvals ?? [];
    const groupIds = approvalRows.map((a: any) => a.approverGroupId).filter(Boolean) as string[];
    const userIds = [
      ...approvalRows.map((a: any) => a.approverUserId),
      ...approvalRows.map((a: any) => a.decidedById),
      ticket.reportedBy,
      ticket.assignedTo,
    ].filter(Boolean) as string[];

    const [groups, admins] = await Promise.all([
      groupIds.length
        ? prisma.adminGroup.findMany({ where: { id: { in: groupIds } }, select: { id: true, name: true } })
        : [],
      userIds.length
        ? prisma.admin.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
        : [],
    ]);

    const groupMap = Object.fromEntries(groups.map((g) => [g.id, g.name]));
    const adminMap = Object.fromEntries(admins.map((a) => [a.id, a.name]));

    const mapped = mapTicketDetail(ticket);
    // reportedBy puede ser un Admin (manual), un OpsGuardia (Portal Guardia)
    // o un CrmContact (Portal Cliente). assignedTo siempre es Admin.
    const { resolveActorNames } = await import("@/lib/notifications/resolve-actor-name");
    const actorMap = await resolveActorNames(
      ctx.tenantId,
      [ticket.reportedBy, ticket.assignedTo].filter(Boolean) as string[],
    );
    mapped.reportedByName = ticket.reportedBy
      ? actorMap.get(ticket.reportedBy)?.name ?? null
      : null;
    mapped.assignedToName = ticket.assignedTo
      ? actorMap.get(ticket.assignedTo)?.name ?? adminMap[ticket.assignedTo] ?? null
      : null;
    if (mapped.approvals) {
      mapped.approvals = mapped.approvals.map((a) => ({
        ...a,
        approverGroupName: a.approverGroupId ? groupMap[a.approverGroupId] ?? null : null,
        approverUserName: a.approverUserId ? adminMap[a.approverUserId] ?? null : null,
        decidedByName: a.decidedById ? adminMap[a.decidedById] ?? null : null,
      }));
    }

    return NextResponse.json({ success: true, data: mapped });
  } catch (error) {
    console.error("[OPS] Error fetching ticket:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo obtener el ticket" },
      { status: 500 },
    );
  }
}

/* ── PATCH /api/ops/tickets/[id] ─────────────────────────────── */

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.opsTicket.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Ticket no encontrado" },
        { status: 404 },
      );
    }

    // Build updatable fields (only include those present in body)
    const updateData: Record<string, any> = {};
    const auditComments: string[] = [];
    const now = new Date();

    if (body.status !== undefined) {
      updateData.status = body.status;
      if (body.status === "resolved") updateData.resolvedAt = now;
      if (body.status === "closed") updateData.closedAt = now;
    }
    if (body.title !== undefined) updateData.title = body.title;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.priority !== undefined) updateData.priority = body.priority;
    if (body.assignedTeam !== undefined) updateData.assignedTeam = body.assignedTeam;
    if (body.assignedTo !== undefined) updateData.assignedTo = body.assignedTo;
    if (body.tags !== undefined) updateData.tags = body.tags;
    if (body.resolutionNotes !== undefined) updateData.resolutionNotes = body.resolutionNotes;

    // ── SLA Extension (aplazar) ──
    if (body.slaDueAt !== undefined) {
      const newDueAt = new Date(body.slaDueAt);
      if (isNaN(newDueAt.getTime()) || newDueAt <= now) {
        return NextResponse.json(
          { success: false, error: "slaDueAt debe ser una fecha futura válida" },
          { status: 400 },
        );
      }
      const reason = (body.slaExtensionReason ?? "").trim();
      if (!reason) {
        return NextResponse.json(
          { success: false, error: "Se requiere slaExtensionReason para aplazar el SLA" },
          { status: 400 },
        );
      }
      if (!isAdminRole(ctx.userRole) && reason.length < 10) {
        return NextResponse.json(
          { success: false, error: "El motivo debe tener al menos 10 caracteres" },
          { status: 400 },
        );
      }
      const prevExtensions = (existing.slaExtensions as SlaExtensionEntry[] | null) ?? [];
      const extensionEntry: SlaExtensionEntry = {
        at: now.toISOString(),
        by: ctx.userId,
        fromDueAt: existing.slaDueAt?.toISOString() ?? "",
        toDueAt: newDueAt.toISOString(),
        reason,
      };
      updateData.slaDueAt = newDueAt;
      updateData.slaExtensions = [...prevExtensions, extensionEntry] as any;
      updateData.slaBreached = false; // reset breach if extending
      const fmtDate = newDueAt.toLocaleString("es-CL", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
      auditComments.push(`SLA aplazado hasta ${fmtDate} — Motivo: ${reason}`);
    }

    // ── SLA Pause / Resume ──
    if (body.slaPaused !== undefined) {
      if (body.slaPaused === true) {
        if (existing.slaPausedAt) {
          return NextResponse.json(
            { success: false, error: "El SLA ya está pausado" },
            { status: 400 },
          );
        }
        const pauseReason = (body.slaPausedReason ?? "").trim();
        updateData.slaPausedAt = now;
        updateData.slaPausedReason = pauseReason || null;
        auditComments.push(`SLA pausado${pauseReason ? ` — Motivo: ${pauseReason}` : ""}`);
      } else {
        // Resume: calculate paused duration, extend slaDueAt
        if (!existing.slaPausedAt) {
          return NextResponse.json(
            { success: false, error: "El SLA no está pausado" },
            { status: 400 },
          );
        }
        const pausedMs = now.getTime() - new Date(existing.slaPausedAt).getTime();
        const totalPausedMs = Number(existing.slaPausedTotalMs ?? 0) + pausedMs;
        updateData.slaPausedTotalMs = BigInt(totalPausedMs);
        updateData.slaPausedAt = null;
        updateData.slaPausedReason = null;
        // Extend slaDueAt by the paused duration
        if (existing.slaDueAt) {
          const extendedDueAt = new Date(existing.slaDueAt.getTime() + pausedMs);
          updateData.slaDueAt = extendedDueAt;
          // Audit the extension
          const prevExtensions = (existing.slaExtensions as SlaExtensionEntry[] | null) ?? [];
          const extensionEntry: SlaExtensionEntry = {
            at: now.toISOString(),
            by: ctx.userId,
            fromDueAt: existing.slaDueAt.toISOString(),
            toDueAt: extendedDueAt.toISOString(),
            reason: "Reanudación de pausa SLA (extensión automática)",
          };
          updateData.slaExtensions = [...prevExtensions, extensionEntry] as any;
          if (extendedDueAt > now) updateData.slaBreached = false;
        }
        const pausedHours = Math.round(pausedMs / (1000 * 60 * 60) * 10) / 10;
        auditComments.push(`SLA reanudado (pausado ${pausedHours}h). Plazo extendido automáticamente.`);
      }
    }

    // ── Snooze notifications ──
    if (body.snoozedUntil !== undefined) {
      if (body.snoozedUntil === null) {
        updateData.snoozedUntil = null;
        auditComments.push("Silenciamiento de avisos removido");
      } else {
        const snoozeUntil = new Date(body.snoozedUntil);
        if (isNaN(snoozeUntil.getTime()) || snoozeUntil <= now) {
          return NextResponse.json(
            { success: false, error: "snoozedUntil debe ser una fecha futura válida" },
            { status: 400 },
          );
        }
        updateData.snoozedUntil = snoozeUntil;
        const fmtDate = snoozeUntil.toLocaleString("es-CL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
        auditComments.push(`Avisos silenciados hasta ${fmtDate}`);
      }
    }

    const updResult = await prisma.opsTicket.updateMany({
      where: { id, tenantId: ctx.tenantId },
      data: updateData,
    });
    if (updResult.count === 0) {
      return NextResponse.json(
        { success: false, error: "Ticket no encontrado" },
        { status: 404 },
      );
    }

    // Notificar al nuevo responsable si cambió la asignación.
    if (
      body.assignedTo !== undefined &&
      body.assignedTo &&
      body.assignedTo !== existing.assignedTo &&
      body.assignedTo !== ctx.userId
    ) {
      try {
        const { notifyTicketAssigned } = await import(
          "@/lib/notifications/notify-ticket-assigned"
        );
        await notifyTicketAssigned({
          tenantId: ctx.tenantId,
          ticketId: id,
          ticketCode: existing.code,
          ticketTitle: existing.title,
          ticketPriority: existing.priority,
          ticketAssignedTeam: body.assignedTeam ?? existing.assignedTeam,
          assigneeId: body.assignedTo,
          assignedById: ctx.userId,
          source: "patch",
        });
      } catch (notifyErr) {
        console.error("[OPS] Error notificando asignación:", notifyErr);
      }
    }

    // Sync bidireccional: si el status pasa a terminal, cerrar findings asociados
    // para que dedup futuras NO los tomen como canónicos.
    if (body.status !== undefined) {
      const TERMINAL = ["resolved", "closed", "cancelled", "rejected"] as const;
      if ((TERMINAL as readonly string[]).includes(body.status)) {
        try {
          await prisma.opsSupervisionFinding.updateMany({
            where: {
              ticketId: id,
              tenantId: ctx.tenantId,
              status: { in: ["open", "in_progress"] },
            },
            data: {
              status: body.status === "resolved" ? "resolved" : "superseded",
              resolvedAt: body.status === "resolved" ? now : null,
              updatedAt: now,
            },
          });
        } catch (syncErr) {
          console.warn("[OPS][TICKETS] No se pudieron sincronizar los findings:", syncErr);
        }
      }
    }

    // Create audit comments for SLA changes
    if (auditComments.length > 0) {
      await prisma.opsTicketComment.createMany({
        data: auditComments.map((body) => ({
          ticketId: id,
          userId: ctx.userId,
          body,
          isInternal: true,
        })),
      });
    }

    // Re-fetch with full includes
    const updated = await prisma.opsTicket.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: ticketDetailIncludes,
    });

    return NextResponse.json({ success: true, data: mapTicketDetail(updated) });
  } catch (error) {
    console.error("[OPS] Error updating ticket:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo actualizar el ticket" },
      { status: 500 },
    );
  }
}

/* ── DELETE /api/ops/tickets/[id] ─────────────────────────────── */

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;

    const ticket = await prisma.opsTicket.findFirst({
      where: { id, tenantId: ctx.tenantId },
      select: { id: true, reportedBy: true },
    });

    if (!ticket) {
      return NextResponse.json(
        { success: false, error: "Ticket no encontrado" },
        { status: 404 },
      );
    }

    // Only the ticket owner (reportedBy) or admin/owner roles can delete
    const isOwner = ticket.reportedBy === ctx.userId;
    const isAdmin = isAdminRole(ctx.userRole);

    if (!isOwner && !isAdmin) {
      return NextResponse.json(
        { success: false, error: "Solo el creador del ticket o un administrador pueden eliminarlo" },
        { status: 403 },
      );
    }

    // Delete related records in a transaction
    await prisma.$transaction(async (tx) => {
      // Unlink refuerzo if exists (set ticketId to null, revert status)
      await tx.opsRefuerzoSolicitud.updateMany({
        where: { ticketId: id, tenantId: ctx.tenantId },
        data: { ticketId: null, status: "solicitado" },
      });

      // Delete approvals (via ticket relation)
      await tx.opsTicketApproval.deleteMany({
        where: { ticketId: id, ticket: { tenantId: ctx.tenantId } },
      });

      // Delete comments (via ticket relation)
      await tx.opsTicketComment.deleteMany({
        where: { ticketId: id, ticket: { tenantId: ctx.tenantId } },
      });

      // Delete the ticket
      await tx.opsTicket.delete({ where: { id } });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[OPS] Error deleting ticket:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo eliminar el ticket" },
      { status: 500 },
    );
  }
}
