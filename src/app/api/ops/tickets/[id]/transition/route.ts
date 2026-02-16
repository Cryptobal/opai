import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import { canTransitionTo } from "@/lib/tickets";
import type { TicketStatus } from "@/lib/tickets";

type Params = { id: string };

/**
 * POST /api/ops/tickets/[id]/transition — Change ticket status
 * Body: { status: TicketStatus, resolutionNotes?: string }
 *
 * Validates transitions using the state machine defined in tickets.ts.
 */
export async function POST(
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

    if (!body.status) {
      return NextResponse.json(
        { success: false, error: "status es requerido" },
        { status: 400 },
      );
    }

    const targetStatus = body.status as TicketStatus;

    // Fetch current ticket
    const ticket = await prisma.opsTicket.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });

    if (!ticket) {
      return NextResponse.json(
        { success: false, error: "Ticket no encontrado" },
        { status: 404 },
      );
    }

    const currentStatus = ticket.status as TicketStatus;

    // Validate transition
    if (!canTransitionTo(currentStatus, targetStatus)) {
      return NextResponse.json(
        {
          success: false,
          error: `Transicion no permitida: ${currentStatus} -> ${targetStatus}`,
        },
        { status: 422 },
      );
    }

    // Build update data
    const updateData: Record<string, any> = {
      status: targetStatus,
    };

    if (targetStatus === "resolved") {
      updateData.resolvedAt = new Date();
      if (body.resolutionNotes) {
        updateData.resolutionNotes = body.resolutionNotes;
      }
    }

    if (targetStatus === "closed") {
      updateData.closedAt = new Date();
    }

    const updated = await prisma.opsTicket.update({
      where: { id },
      data: updateData,
      include: {
        ticketType: { select: { id: true, name: true, slug: true, origin: true } },
        guardia: {
          select: {
            id: true,
            code: true,
            persona: { select: { firstName: true, lastName: true } },
          },
        },
        _count: { select: { comments: true, approvals: true } },
      },
    });

    // Build response
    const guardiaName =
      updated.guardia?.persona
        ? `${updated.guardia.persona.firstName} ${updated.guardia.persona.lastName}`
        : null;

    const data = {
      id: updated.id,
      tenantId: updated.tenantId,
      code: updated.code,
      ticketTypeId: updated.ticketTypeId,
      ticketType: updated.ticketType ?? null,
      categoryId: updated.ticketTypeId ?? "",
      status: updated.status,
      priority: updated.priority,
      title: updated.title,
      description: updated.description,
      assignedTeam: updated.assignedTeam,
      assignedTo: updated.assignedTo,
      installationId: updated.installationId,
      source: updated.source,
      sourceLogId: null,
      sourceGuardEventId: updated.sourceGuardEventId,
      guardiaId: updated.guardiaId,
      guardiaName,
      reportedBy: updated.reportedBy,
      slaDueAt: updated.slaDueAt instanceof Date ? updated.slaDueAt.toISOString() : updated.slaDueAt,
      slaBreached: updated.slaBreached,
      resolvedAt: updated.resolvedAt instanceof Date ? updated.resolvedAt.toISOString() : updated.resolvedAt,
      closedAt: updated.closedAt instanceof Date ? updated.closedAt.toISOString() : updated.closedAt,
      resolutionNotes: updated.resolutionNotes,
      tags: updated.tags ?? [],
      currentApprovalStep: updated.currentApprovalStep,
      approvalStatus: updated.approvalStatus,
      createdAt: updated.createdAt instanceof Date ? updated.createdAt.toISOString() : updated.createdAt,
      updatedAt: updated.updatedAt instanceof Date ? updated.updatedAt.toISOString() : updated.updatedAt,
      commentsCount: updated._count?.comments ?? 0,
      attachmentsCount: 0,
    };

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[OPS] Error transitioning ticket:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo cambiar el estado del ticket" },
      { status: 500 },
    );
  }
}
