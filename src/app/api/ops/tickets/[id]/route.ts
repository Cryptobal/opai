import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import { isAdminRole } from "@/lib/access";
import type { Ticket, TicketApproval } from "@/lib/tickets";

type Params = { id: string };

/* ── Prisma includes for full detail ─────────────────────────── */

const ticketDetailIncludes = {
  ticketType: { select: { id: true, name: true, slug: true, origin: true } },
  guardia: {
    select: {
      id: true,
      code: true,
      persona: { select: { firstName: true, lastName: true } },
    },
  },
  approvals: { orderBy: { stepOrder: "asc" as const } },
  comments: { orderBy: { createdAt: "desc" as const } },
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
    reportedBy: t.reportedBy,
    slaDueAt: t.slaDueAt instanceof Date ? t.slaDueAt.toISOString() : t.slaDueAt,
    slaBreached: t.slaBreached,
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
    mapped.reportedByName = ticket.reportedBy ? adminMap[ticket.reportedBy] ?? null : null;
    mapped.assignedToName = ticket.assignedTo ? adminMap[ticket.assignedTo] ?? null : null;
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
    if (body.status !== undefined) {
      updateData.status = body.status;
      if (body.status === "resolved") updateData.resolvedAt = new Date();
      if (body.status === "closed") updateData.closedAt = new Date();
    }
    if (body.title !== undefined) updateData.title = body.title;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.priority !== undefined) updateData.priority = body.priority;
    if (body.assignedTeam !== undefined) updateData.assignedTeam = body.assignedTeam;
    if (body.assignedTo !== undefined) updateData.assignedTo = body.assignedTo;
    if (body.tags !== undefined) updateData.tags = body.tags;
    if (body.resolutionNotes !== undefined) updateData.resolutionNotes = body.resolutionNotes;

    await prisma.opsTicket.update({
      where: { id },
      data: updateData,
    });

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
        where: { ticketId: id },
        data: { ticketId: null, status: "solicitado" },
      });

      // Delete approvals
      await tx.opsTicketApproval.deleteMany({ where: { ticketId: id } });

      // Delete comments
      await tx.opsTicketComment.deleteMany({ where: { ticketId: id } });

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
