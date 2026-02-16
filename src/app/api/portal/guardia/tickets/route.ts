import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateTicketCode, TICKET_STATUS_CONFIG } from "@/lib/tickets";
import type { GuardTicket } from "@/lib/guard-portal";

/* ── GET /api/portal/guardia/tickets ───────────────────────── */

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const guardiaId = searchParams.get("guardiaId");

    if (!guardiaId) {
      return NextResponse.json(
        { success: false, error: "guardiaId es requerido" },
        { status: 400 },
      );
    }

    const tickets = await prisma.opsTicket.findMany({
      where: { guardiaId },
      include: {
        ticketType: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const data: GuardTicket[] = tickets.map((t) => ({
      id: t.id,
      code: t.code,
      title: t.title,
      typeName: t.ticketType?.name ?? "Sin tipo",
      status: t.status,
      statusLabel:
        (TICKET_STATUS_CONFIG as Record<string, { label: string }>)[t.status]?.label ?? t.status,
      priority: t.priority,
      createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : String(t.createdAt),
      updatedAt: t.updatedAt instanceof Date ? t.updatedAt.toISOString() : String(t.updatedAt),
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[Portal Guardia] Tickets GET error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener tickets" },
      { status: 500 },
    );
  }
}

/* ── POST /api/portal/guardia/tickets ──────────────────────── */

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { guardiaId, ticketTypeId, title, description, tenantId } = body as {
      guardiaId?: string;
      ticketTypeId?: string;
      title?: string;
      description?: string;
      tenantId?: string;
    };

    if (!guardiaId || !ticketTypeId || !title) {
      return NextResponse.json(
        { success: false, error: "guardiaId, ticketTypeId y title son requeridos" },
        { status: 400 },
      );
    }

    // Load guardia to get tenantId if not provided
    const guardia = await prisma.opsGuardia.findUnique({
      where: { id: guardiaId },
      select: { tenantId: true },
    });

    if (!guardia) {
      return NextResponse.json(
        { success: false, error: "Guardia no encontrado" },
        { status: 404 },
      );
    }

    const effectiveTenantId = tenantId ?? guardia.tenantId;

    // Load ticket type for defaults
    const ticketType = await prisma.opsTicketType.findFirst({
      where: { id: ticketTypeId, tenantId: effectiveTenantId },
      include: {
        approvalSteps: { orderBy: { stepOrder: "asc" } },
      },
    });

    if (!ticketType) {
      return NextResponse.json(
        { success: false, error: "Tipo de ticket no encontrado" },
        { status: 404 },
      );
    }

    // Generate sequential code
    const ticketCount = await prisma.opsTicket.count({
      where: { tenantId: effectiveTenantId },
    });
    const code = generateTicketCode(ticketCount + 1);

    // Calculate SLA
    const slaHours = ticketType.slaHours;
    const slaDueAt = new Date(Date.now() + slaHours * 60 * 60 * 1000);

    // Determine initial status
    const needsApproval =
      ticketType.requiresApproval && ticketType.approvalSteps.length > 0;
    const initialStatus = needsApproval ? "pending_approval" : "open";

    // Create ticket
    const ticket = await prisma.opsTicket.create({
      data: {
        tenantId: effectiveTenantId,
        code,
        ticketTypeId,
        status: initialStatus,
        priority: ticketType.defaultPriority,
        title,
        description: description ?? null,
        assignedTeam: ticketType.assignedTeam,
        source: "portal",
        guardiaId,
        reportedBy: guardiaId,
        slaDueAt,
        currentApprovalStep: needsApproval ? 1 : null,
        approvalStatus: needsApproval ? "pending" : null,
      },
      include: {
        ticketType: { select: { name: true } },
      },
    });

    // If needs approval, create approval records
    if (needsApproval) {
      const approvalData = ticketType.approvalSteps.map((step) => ({
        ticketId: ticket.id,
        stepOrder: step.stepOrder,
        stepLabel: step.label,
        approverType: step.approverType,
        approverGroupId: step.approverGroupId,
        approverUserId: step.approverUserId,
        decision: "pending",
      }));

      await prisma.opsTicketApproval.createMany({ data: approvalData });
    }

    const result: GuardTicket = {
      id: ticket.id,
      code: ticket.code,
      title: ticket.title,
      typeName: ticket.ticketType?.name ?? "Sin tipo",
      status: ticket.status,
      statusLabel:
        (TICKET_STATUS_CONFIG as Record<string, { label: string }>)[ticket.status]?.label ??
        ticket.status,
      priority: ticket.priority,
      createdAt:
        ticket.createdAt instanceof Date ? ticket.createdAt.toISOString() : String(ticket.createdAt),
      updatedAt:
        ticket.updatedAt instanceof Date ? ticket.updatedAt.toISOString() : String(ticket.updatedAt),
    };

    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (error) {
    console.error("[Portal Guardia] Tickets POST error:", error);
    return NextResponse.json(
      { success: false, error: "Error al crear ticket" },
      { status: 500 },
    );
  }
}
