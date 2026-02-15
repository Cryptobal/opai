import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
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

    return NextResponse.json({ success: true, data: mapTicketDetail(ticket) });
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
