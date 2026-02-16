import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import type { TicketType, TicketTypeApprovalStep } from "@/lib/tickets";

type Params = { id: string };

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

/* ── GET /api/ops/ticket-types/[id] ─────────────────────────── */

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

    const ticketType = await prisma.opsTicketType.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: approvalStepsInclude,
    });

    if (!ticketType) {
      return NextResponse.json(
        { success: false, error: "Tipo de ticket no encontrado" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data: mapTicketType(ticketType) });
  } catch (error) {
    console.error("[OPS] Error fetching ticket type:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo obtener el tipo de ticket" },
      { status: 500 },
    );
  }
}

/* ── PATCH /api/ops/ticket-types/[id] ───────────────────────── */

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

    const existing = await prisma.opsTicketType.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Tipo de ticket no encontrado" },
        { status: 404 },
      );
    }

    // Build updatable fields (only include those present in body)
    const updateData: Record<string, any> = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.origin !== undefined) updateData.origin = body.origin;
    if (body.requiresApproval !== undefined) updateData.requiresApproval = body.requiresApproval;
    if (body.assignedTeam !== undefined) updateData.assignedTeam = body.assignedTeam;
    if (body.defaultPriority !== undefined) updateData.defaultPriority = body.defaultPriority;
    if (body.slaHours !== undefined) updateData.slaHours = body.slaHours;
    if (body.icon !== undefined) updateData.icon = body.icon;
    if (body.isActive !== undefined) updateData.isActive = body.isActive;
    if (body.sortOrder !== undefined) updateData.sortOrder = body.sortOrder;

    // If approvalSteps provided, delete all existing and recreate
    if (Array.isArray(body.approvalSteps)) {
      await prisma.$transaction(async (tx) => {
        // Delete existing steps
        await tx.opsTicketTypeApprovalStep.deleteMany({
          where: { ticketTypeId: id },
        });

        // Create new steps
        if (body.approvalSteps.length > 0) {
          await tx.opsTicketTypeApprovalStep.createMany({
            data: body.approvalSteps.map((s: any, idx: number) => ({
              ticketTypeId: id,
              stepOrder: s.stepOrder ?? idx + 1,
              approverType: s.approverType ?? "group",
              approverGroupId: s.approverGroupId ?? null,
              approverUserId: s.approverUserId ?? null,
              label: s.label ?? `Paso ${idx + 1}`,
              isRequired: s.isRequired ?? true,
            })),
          });
        }

        // Update the ticket type fields
        await tx.opsTicketType.update({
          where: { id },
          data: updateData,
        });
      });
    } else {
      // Just update the ticket type fields
      await prisma.opsTicketType.update({
        where: { id },
        data: updateData,
      });
    }

    // Re-fetch with includes to return the full object
    const updated = await prisma.opsTicketType.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: approvalStepsInclude,
    });

    return NextResponse.json({ success: true, data: mapTicketType(updated) });
  } catch (error) {
    console.error("[OPS] Error updating ticket type:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo actualizar el tipo de ticket" },
      { status: 500 },
    );
  }
}

/* ── DELETE /api/ops/ticket-types/[id] ──────────────────────── */

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

    const existing = await prisma.opsTicketType.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Tipo de ticket no encontrado" },
        { status: 404 },
      );
    }

    // Soft delete only — types may be referenced by existing tickets
    await prisma.opsTicketType.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true, data: { id, deleted: true } });
  } catch (error) {
    console.error("[OPS] Error deleting ticket type:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo eliminar el tipo de ticket" },
      { status: 500 },
    );
  }
}
