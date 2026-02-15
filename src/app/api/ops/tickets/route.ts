import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import { generateTicketCode } from "@/lib/tickets";
import type { Ticket } from "@/lib/tickets";

/* ── Prisma includes for list view ──────────────────────────── */

const ticketListIncludes = {
  ticketType: { select: { id: true, name: true, slug: true, origin: true } },
  guardia: {
    select: {
      id: true,
      code: true,
      persona: { select: { firstName: true, lastName: true } },
    },
  },
  _count: { select: { comments: true, approvals: true } },
};

/* ── Mapper ──────────────────────────────────────────────────── */

function mapTicket(t: any): Ticket {
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
    createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : t.createdAt,
    updatedAt: t.updatedAt instanceof Date ? t.updatedAt.toISOString() : t.updatedAt,
    commentsCount: t._count?.comments ?? 0,
    attachmentsCount: 0,
  };
}

/* ── GET /api/ops/tickets ────────────────────────────────────── */

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const priority = searchParams.get("priority");
    const assignedTeam = searchParams.get("assignedTeam");
    const ticketTypeId = searchParams.get("ticketTypeId");
    const guardiaId = searchParams.get("guardiaId");
    const search = searchParams.get("search");
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10)));
    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = { tenantId: ctx.tenantId };
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (assignedTeam) where.assignedTeam = assignedTeam;
    if (ticketTypeId) where.ticketTypeId = ticketTypeId;
    if (guardiaId) where.guardiaId = guardiaId;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { code: { contains: search, mode: "insensitive" } },
      ];
    }

    const [rows, total] = await Promise.all([
      prisma.opsTicket.findMany({
        where,
        include: ticketListIncludes,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.opsTicket.count({ where }),
    ]);

    const items: Ticket[] = rows.map(mapTicket);

    return NextResponse.json({
      success: true,
      data: { items, total, page, limit },
    });
  } catch (error) {
    console.error("[OPS] Error listing tickets:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo obtener los tickets" },
      { status: 500 },
    );
  }
}

/* ── POST /api/ops/tickets ───────────────────────────────────── */

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const body = await request.json();

    // ticketTypeId is the preferred field; categoryId for backward compat
    const typeId: string | undefined = body.ticketTypeId ?? body.categoryId;

    if (!typeId || !body.title) {
      return NextResponse.json(
        { success: false, error: "Campos requeridos: ticketTypeId (o categoryId), title" },
        { status: 400 },
      );
    }

    // Load ticket type for defaults
    const ticketType = await prisma.opsTicketType.findFirst({
      where: { id: typeId, tenantId: ctx.tenantId },
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
      where: { tenantId: ctx.tenantId },
    });
    const code = generateTicketCode(ticketCount + 1);

    // Calculate SLA
    const slaHours = ticketType.slaHours;
    const slaDueAt = new Date(Date.now() + slaHours * 60 * 60 * 1000);

    // Determine initial status & approval data
    const requiresApproval =
      ticketType.requiresApproval && ticketType.approvalSteps.length > 0;
    const initialStatus = requiresApproval ? "pending_approval" : "open";

    // Build approval records if needed
    const approvalCreateData = requiresApproval
      ? ticketType.approvalSteps.map((step) => ({
          stepOrder: step.stepOrder,
          stepLabel: step.label,
          approverType: step.approverType,
          approverGroupId: step.approverGroupId,
          approverUserId: step.approverUserId,
          decision: "pending",
        }))
      : [];

    const ticket = await prisma.opsTicket.create({
      data: {
        tenantId: ctx.tenantId,
        code,
        ticketTypeId: typeId,
        status: initialStatus,
        priority: body.priority ?? ticketType.defaultPriority,
        title: body.title,
        description: body.description ?? null,
        assignedTeam: body.assignedTeam ?? ticketType.assignedTeam,
        assignedTo: body.assignedTo ?? null,
        installationId: body.installationId ?? null,
        source: body.source ?? "manual",
        sourceGuardEventId: body.sourceGuardEventId ?? null,
        guardiaId: body.guardiaId ?? null,
        reportedBy: ctx.userId,
        slaDueAt,
        slaBreached: false,
        tags: body.tags ?? [],
        currentApprovalStep: requiresApproval ? 1 : null,
        approvalStatus: requiresApproval ? "pending" : null,
        approvals: {
          create: approvalCreateData,
        },
      },
      include: ticketListIncludes,
    });

    return NextResponse.json(
      { success: true, data: mapTicket(ticket) },
      { status: 201 },
    );
  } catch (error) {
    console.error("[OPS] Error creating ticket:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo crear el ticket" },
      { status: 500 },
    );
  }
}
