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

    // Accept both frontend format (action: "approve"/"reject") and canonical (decision: "approved"/"rejected")
    let resolvedDecision: "approved" | "rejected" | null = null;
    if (body.decision && ["approved", "rejected"].includes(body.decision)) {
      resolvedDecision = body.decision;
    } else if (body.action === "approve") {
      resolvedDecision = "approved";
    } else if (body.action === "reject") {
      resolvedDecision = "rejected";
    }

    if (!resolvedDecision) {
      return NextResponse.json(
        { success: false, error: "Campo requerido: decision ('approved' | 'rejected') o action ('approve' | 'reject')" },
        { status: 400 },
      );
    }

    const { decideTicketApproval } = await import("@/lib/tickets-approvals");
    const result = await decideTicketApproval({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      ticketId,
      decision: resolvedDecision,
      comment: typeof body.comment === "string" ? body.comment : null,
    });

    if (!result.ok || !result.approval) {
      return NextResponse.json(
        { success: false, error: result.error ?? "No se pudo registrar la aprobacion" },
        { status: result.httpStatus },
      );
    }

    return NextResponse.json(
      { success: true, data: mapApproval(result.approval) },
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
