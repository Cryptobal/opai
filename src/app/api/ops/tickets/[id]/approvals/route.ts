import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import type { TicketApproval } from "@/lib/tickets";

type Params = { id: string };

/* ── Mapper ──────────────────────────────────────────────────── */

function mapApproval(a: any): TicketApproval {
  return {
    id: a.id,
    ticketId: a.ticketId,
    stepOrder: a.stepOrder,
    stepLabel: a.stepLabel,
    approverType: a.approverType,
    approverGroupId: a.approverGroupId,
    approverGroupName: a.approverGroup?.name ?? null,
    approverUserId: a.approverUserId,
    approverUserName: a.approverUser?.name ?? null,
    decision: a.decision,
    decidedById: a.decidedById,
    decidedByName: a.decidedBy?.name ?? null,
    comment: a.comment,
    decidedAt: a.decidedAt instanceof Date ? a.decidedAt.toISOString() : a.decidedAt,
    createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : a.createdAt,
  };
}

/* ── GET /api/ops/tickets/[id]/approvals ─────────────────────── */

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id: ticketId } = await params;

    // Verify ticket belongs to tenant
    const ticket = await prisma.opsTicket.findFirst({
      where: { id: ticketId, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!ticket) {
      return NextResponse.json(
        { success: false, error: "Ticket no encontrado" },
        { status: 404 },
      );
    }

    const approvals = await prisma.opsTicketApproval.findMany({
      where: { ticketId },
      orderBy: { stepOrder: "asc" },
    });

    const groupIds = approvals.map((a) => a.approverGroupId).filter(Boolean) as string[];
    const userIds = [
      ...approvals.map((a) => a.approverUserId),
      ...approvals.map((a) => a.decidedById),
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

    const items: TicketApproval[] = approvals.map((a) => ({
      ...mapApproval(a),
      approverGroupName: a.approverGroupId ? groupMap[a.approverGroupId] ?? null : null,
      approverUserName: a.approverUserId ? adminMap[a.approverUserId] ?? null : null,
      decidedByName: a.decidedById ? adminMap[a.decidedById] ?? null : null,
    }));

    return NextResponse.json({ success: true, data: { items } });
  } catch (error) {
    console.error("[OPS] Error listing ticket approvals:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo obtener las aprobaciones del ticket" },
      { status: 500 },
    );
  }
}

/* ── POST /api/ops/tickets/[id]/approvals ────────────────────── */

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id: ticketId } = await params;
    const body = await request.json();

    if (!body.decision || !["approved", "rejected"].includes(body.decision)) {
      return NextResponse.json(
        { success: false, error: "Campo requerido: decision ('approved' | 'rejected')" },
        { status: 400 },
      );
    }

    // Load ticket and verify state
    const ticket = await prisma.opsTicket.findFirst({
      where: { id: ticketId, tenantId: ctx.tenantId },
    });

    if (!ticket) {
      return NextResponse.json(
        { success: false, error: "Ticket no encontrado" },
        { status: 404 },
      );
    }

    if (ticket.status !== "pending_approval" || ticket.currentApprovalStep == null) {
      return NextResponse.json(
        { success: false, error: "El ticket no esta en estado de aprobacion pendiente" },
        { status: 422 },
      );
    }

    // Find the current pending approval step
    const currentApproval = await prisma.opsTicketApproval.findFirst({
      where: {
        ticketId,
        stepOrder: ticket.currentApprovalStep,
        decision: "pending",
      },
    });

    if (!currentApproval) {
      return NextResponse.json(
        { success: false, error: "No se encontro el paso de aprobacion pendiente" },
        { status: 422 },
      );
    }

    const now = new Date();
    const decision = body.decision as "approved" | "rejected";

    // Update the approval record
    const updatedApproval = await prisma.opsTicketApproval.update({
      where: { id: currentApproval.id },
      data: {
        decision,
        decidedById: ctx.userId,
        comment: body.comment ?? null,
        decidedAt: now,
      },
    });

    // Update ticket based on decision
    if (decision === "rejected") {
      // Rejected: ticket goes to "rejected" status
      await prisma.opsTicket.update({
        where: { id: ticketId },
        data: {
          status: "rejected",
          approvalStatus: "rejected",
        },
      });
    } else {
      // Approved: check for next step
      const nextStep = await prisma.opsTicketApproval.findFirst({
        where: {
          ticketId,
          stepOrder: { gt: ticket.currentApprovalStep },
          decision: "pending",
        },
        orderBy: { stepOrder: "asc" },
      });

      if (nextStep) {
        // Advance to next step
        await prisma.opsTicket.update({
          where: { id: ticketId },
          data: {
            currentApprovalStep: nextStep.stepOrder,
          },
        });
      } else {
        // All steps approved: ticket moves to "open"
        await prisma.opsTicket.update({
          where: { id: ticketId },
          data: {
            status: "open",
            approvalStatus: "approved",
            currentApprovalStep: null,
          },
        });
      }
    }

    try {
      const deciderName = await prisma.admin.findUnique({
        where: { id: ctx.userId },
        select: { name: true },
      });
      const notifTitle = decision === "approved"
        ? `Ticket ${ticket.code} aprobado (paso ${ticket.currentApprovalStep})`
        : `Ticket ${ticket.code} rechazado`;
      const notifMessage = decision === "approved"
        ? `${deciderName?.name ?? "Un usuario"} aprobó el paso "${currentApproval.stepLabel}"`
        : `${deciderName?.name ?? "Un usuario"} rechazó el ticket: ${body.comment ?? "sin comentario"}`;

      const { sendNotification } = await import("@/lib/notification-service");
      await sendNotification({
        tenantId: ctx.tenantId,
        type: decision === "approved" ? "ticket_approved" : "ticket_rejected",
        title: notifTitle,
        message: notifMessage,
        data: { ticketId, code: ticket.code, decision, step: currentApproval.stepLabel },
        link: `/ops/tickets/${ticketId}`,
      });
    } catch {}

    return NextResponse.json(
      { success: true, data: mapApproval(updatedApproval) },
      { status: 201 },
    );
  } catch (error) {
    console.error("[OPS] Error creating ticket approval:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo registrar la aprobacion" },
      { status: 500 },
    );
  }
}
