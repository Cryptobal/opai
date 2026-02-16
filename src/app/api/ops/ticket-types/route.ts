import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import type { TicketType, TicketTypeApprovalStep } from "@/lib/tickets";

/* ── Mappers ─────────────────────────────────────────────────── */

function mapApprovalStep(step: any): TicketTypeApprovalStep {
  return {
    id: step.id,
    ticketTypeId: step.ticketTypeId,
    stepOrder: step.stepOrder,
    approverType: step.approverType,
    approverGroupId: step.approverGroupId,
    approverUserId: step.approverUserId,
    label: step.label,
    isRequired: step.isRequired,
    approverGroupName: step.approverGroup?.name ?? undefined,
  };
}

function mapTicketType(tt: any): TicketType {
  return {
    id: tt.id,
    tenantId: tt.tenantId,
    slug: tt.slug,
    name: tt.name,
    description: tt.description,
    origin: tt.origin,
    requiresApproval: tt.requiresApproval,
    assignedTeam: tt.assignedTeam,
    defaultPriority: tt.defaultPriority,
    slaHours: tt.slaHours,
    icon: tt.icon,
    isActive: tt.isActive,
    sortOrder: tt.sortOrder,
    approvalSteps: (tt.approvalSteps ?? []).map(mapApprovalStep),
    createdAt:
      tt.createdAt instanceof Date
        ? tt.createdAt.toISOString()
        : tt.createdAt,
    updatedAt:
      tt.updatedAt instanceof Date
        ? tt.updatedAt.toISOString()
        : tt.updatedAt,
  };
}

/* ── Include fragment for approval steps ─────────────────────── */

const approvalStepsInclude = {
  approvalSteps: {
    include: { approverGroup: { select: { name: true } } },
    orderBy: { stepOrder: "asc" as const },
  },
};

/* ── GET /api/ops/ticket-types ──────────────────────────────── */

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get("activeOnly") !== "false"; // default true

    const rows = await prisma.opsTicketType.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(activeOnly ? { isActive: true } : {}),
      },
      include: approvalStepsInclude,
      orderBy: { sortOrder: "asc" },
    });

    const items: TicketType[] = rows.map(mapTicketType);

    return NextResponse.json({ success: true, data: { items } });
  } catch (error) {
    console.error("[OPS] Error listing ticket types:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo obtener los tipos de ticket" },
      { status: 500 },
    );
  }
}

/* ── POST /api/ops/ticket-types ─────────────────────────────── */

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const body = await request.json();

    if (!body.slug || !body.name || !body.assignedTeam) {
      return NextResponse.json(
        { success: false, error: "Campos requeridos: slug, name, assignedTeam" },
        { status: 400 },
      );
    }

    // Check unique slug within tenant
    const existing = await prisma.opsTicketType.findUnique({
      where: {
        tenantId_slug: { tenantId: ctx.tenantId, slug: body.slug },
      },
    });
    if (existing) {
      return NextResponse.json(
        { success: false, error: `Ya existe un tipo de ticket con slug "${body.slug}"` },
        { status: 409 },
      );
    }

    // Auto-calculate sortOrder as max + 1
    const maxSort = await prisma.opsTicketType.aggregate({
      where: { tenantId: ctx.tenantId },
      _max: { sortOrder: true },
    });
    const nextSortOrder = (maxSort._max.sortOrder ?? 0) + 1;

    // Build nested approval steps (if provided)
    const approvalStepsData = Array.isArray(body.approvalSteps)
      ? body.approvalSteps.map((s: any, idx: number) => ({
          stepOrder: s.stepOrder ?? idx + 1,
          approverType: s.approverType ?? "group",
          approverGroupId: s.approverGroupId ?? null,
          approverUserId: s.approverUserId ?? null,
          label: s.label ?? `Paso ${idx + 1}`,
          isRequired: s.isRequired ?? true,
        }))
      : [];

    const ticketType = await prisma.opsTicketType.create({
      data: {
        tenantId: ctx.tenantId,
        slug: body.slug,
        name: body.name,
        description: body.description ?? null,
        origin: body.origin ?? "internal",
        requiresApproval: body.requiresApproval ?? false,
        assignedTeam: body.assignedTeam,
        defaultPriority: body.defaultPriority ?? "p3",
        slaHours: body.slaHours ?? 72,
        icon: body.icon ?? null,
        isActive: true,
        sortOrder: nextSortOrder,
        approvalSteps: {
          create: approvalStepsData,
        },
      },
      include: approvalStepsInclude,
    });

    return NextResponse.json(
      { success: true, data: mapTicketType(ticketType) },
      { status: 201 },
    );
  } catch (error) {
    console.error("[OPS] Error creating ticket type:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo crear el tipo de ticket" },
      { status: 500 },
    );
  }
}
