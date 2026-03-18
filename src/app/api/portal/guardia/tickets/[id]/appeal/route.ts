import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Params = { id: string };

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const { id: ticketId } = await params;
    const body = await request.json();
    const { guardiaId, comment } = body as { guardiaId?: string; comment?: string };

    if (!guardiaId) {
      return NextResponse.json({ success: false, error: "guardiaId requerido" }, { status: 400 });
    }

    const ticket = await prisma.opsTicket.findFirst({
      where: { id: ticketId, guardiaId },
      select: { id: true, status: true, approvalStatus: true, tenantId: true, code: true, title: true, ticketTypeId: true },
    });

    if (!ticket) {
      return NextResponse.json({ success: false, error: "Ticket no encontrado" }, { status: 404 });
    }

    if (ticket.status !== "rejected") {
      return NextResponse.json({ success: false, error: "Solo se pueden apelar tickets rechazados" }, { status: 400 });
    }

    // Load ticket type to recreate approval steps
    const ticketType = await prisma.opsTicketType.findFirst({
      where: { id: ticket.ticketTypeId!, tenantId: ticket.tenantId },
      include: { approvalSteps: { orderBy: { stepOrder: "asc" } } },
    });

    await prisma.$transaction(async (tx) => {
      // Add appeal comment
      if (comment?.trim()) {
        await tx.opsTicketComment.create({
          data: {
            ticketId,
            userId: guardiaId,
            body: `[Apelacion] ${comment.trim()}`,
            isInternal: false,
          },
        });
      }

      // Delete old approval records
      await tx.opsTicketApproval.deleteMany({
        where: { ticketId, ticket: { tenantId: ticket.tenantId } },
      });

      // Recreate approval steps if ticket type has them
      const needsApproval = ticketType?.requiresApproval && ticketType.approvalSteps.length > 0;

      if (needsApproval) {
        await tx.opsTicketApproval.createMany({
          data: ticketType!.approvalSteps.map((step) => ({
            ticketId,
            stepOrder: step.stepOrder,
            stepLabel: step.label,
            approverType: step.approverType,
            approverGroupId: step.approverGroupId,
            approverUserId: step.approverUserId,
            decision: "pending",
          })),
        });
      }

      // Update ticket status back to pending_approval
      const updResult = await tx.opsTicket.updateMany({
        where: { id: ticketId, tenantId: ticket.tenantId },
        data: {
          status: needsApproval ? "pending_approval" : "open",
          approvalStatus: needsApproval ? "pending" : null,
          currentApprovalStep: needsApproval ? 1 : null,
          resolvedAt: null,
          closedAt: null,
        },
      });
      if (updResult.count === 0) {
        throw new Error("TICKET_NOT_FOUND");
      }
    });

    // Send notification to approval group
    try {
      const { sendNotificationToUsers } = await import("@/lib/notification-service");
      const targetUserIds: string[] = [];

      if (ticketType?.requiresApproval && ticketType.approvalSteps.length > 0) {
        const firstStep = ticketType.approvalSteps[0];
        if (firstStep.approverGroupId) {
          const members = await prisma.adminGroupMembership.findMany({
            where: { groupId: firstStep.approverGroupId },
            select: { adminId: true },
          });
          for (const m of members) targetUserIds.push(m.adminId);
        }
      }

      if (targetUserIds.length > 0) {
        await sendNotificationToUsers({
          tenantId: ticket.tenantId,
          type: "ticket_created",
          title: `Apelacion ticket ${ticket.code}`,
          message: `El guardia apelo el rechazo del ticket "${ticket.title}"`,
          data: { ticketId, code: ticket.code },
          link: `/ops/tickets/${ticketId}`,
          targetUserIds: [...new Set(targetUserIds)],
        });
      }
    } catch {
      // Notification errors should not fail the appeal
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "TICKET_NOT_FOUND") {
      return NextResponse.json({ success: false, error: "Ticket no encontrado" }, { status: 404 });
    }
    console.error("[Portal] Appeal error:", error);
    return NextResponse.json({ success: false, error: "Error al apelar" }, { status: 500 });
  }
}
