import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAuth,
  unauthorized,
  parseBody,
  resolveApiPerms,
} from "@/lib/api-auth";
import { canView, canEdit, canDelete, hasCapability } from "@/lib/permissions";
import { z } from "zod";

type Params = { id: string };

const updateRendicionSchema = z.object({
  amount: z.number().int().min(0).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  description: z.string().max(500).optional().nullable(),
  documentType: z.enum(["BOLETA", "FACTURA", "SIN_RESPALDO"]).optional().nullable(),
  itemId: z.string().uuid().optional().nullable(),
  costCenterId: z.string().uuid().optional().nullable(),
  type: z.enum(["PURCHASE", "MILEAGE"]).optional(),
});

// ── GET: detail with relations ──

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    if (!canView(perms, "finance", "rendiciones")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos para ver rendiciones" },
        { status: 403 },
      );
    }

    const { id } = await params;

    const rendicion = await prisma.financeRendicion.findFirst({
      where: {
        id,
        tenantId: ctx.tenantId,
        // If user can't view all, only their own
        ...(!hasCapability(perms, "rendicion_view_all")
          ? { submitterId: ctx.userId }
          : {}),
      },
      include: {
        item: { select: { id: true, name: true, code: true, category: true } },
        costCenter: { select: { id: true, name: true, code: true } },
        trip: true,
        payment: { select: { id: true, code: true, paidAt: true, type: true } },
        approvals: {
          orderBy: { approvalOrder: "asc" },
        },
        attachments: {
          orderBy: { createdAt: "desc" },
        },
        history: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!rendicion) {
      return NextResponse.json(
        { success: false, error: "Rendición no encontrada" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data: rendicion });
  } catch (error) {
    console.error("[Finance] Error getting rendicion:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo obtener la rendición" },
      { status: 500 },
    );
  }
}

// ── PATCH: update (only DRAFT or REJECTED) ──

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    if (!canEdit(perms, "finance", "rendiciones")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos para editar rendiciones" },
        { status: 403 },
      );
    }

    const { id } = await params;

    const parsed = await parseBody(request, updateRendicionSchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    const existing = await prisma.financeRendicion.findFirst({
      where: { id, tenantId: ctx.tenantId, submitterId: ctx.userId },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Rendición no encontrada" },
        { status: 404 },
      );
    }

    if (!["DRAFT", "REJECTED"].includes(existing.status)) {
      return NextResponse.json(
        {
          success: false,
          error: `Solo se puede editar en estado DRAFT o REJECTED (actual: ${existing.status})`,
        },
        { status: 400 },
      );
    }

    const updateData: Record<string, unknown> = {};
    if (body.amount !== undefined) updateData.amount = body.amount;
    if (body.date !== undefined) updateData.date = new Date(`${body.date}T00:00:00.000Z`);
    if (body.description !== undefined) updateData.description = body.description;
    if (body.documentType !== undefined) updateData.documentType = body.documentType;
    if (body.itemId !== undefined) updateData.itemId = body.itemId;
    if (body.costCenterId !== undefined) updateData.costCenterId = body.costCenterId;
    if (body.type !== undefined) updateData.type = body.type;

    // If editing a rejected rendicion, revert to DRAFT
    if (existing.status === "REJECTED") {
      updateData.status = "DRAFT";
      updateData.rejectedAt = null;
      updateData.rejectionReason = null;
      updateData.rejectedById = null;
    }

    const rendicion = await prisma.$transaction(async (tx) => {
      const updated = await tx.financeRendicion.update({
        where: { id },
        data: updateData,
        include: {
          item: { select: { id: true, name: true } },
          costCenter: { select: { id: true, name: true } },
        },
      });

      await tx.financeRendicionHistory.create({
        data: {
          rendicionId: id,
          action: "EDITED",
          fromStatus: existing.status,
          toStatus: updated.status,
          userId: ctx.userId,
          userName: ctx.userEmail,
        },
      });

      return updated;
    });

    return NextResponse.json({ success: true, data: rendicion });
  } catch (error) {
    console.error("[Finance] Error updating rendicion:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo actualizar la rendición" },
      { status: 500 },
    );
  }
}

// ── DELETE: only DRAFT ──

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    if (!canDelete(perms, "finance", "rendiciones")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos para eliminar rendiciones" },
        { status: 403 },
      );
    }

    const { id } = await params;

    const existing = await prisma.financeRendicion.findFirst({
      where: { id, tenantId: ctx.tenantId, submitterId: ctx.userId },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Rendición no encontrada" },
        { status: 404 },
      );
    }

    if (existing.status !== "DRAFT") {
      return NextResponse.json(
        { success: false, error: "Solo se pueden eliminar rendiciones en estado DRAFT" },
        { status: 400 },
      );
    }

    await prisma.financeRendicion.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Finance] Error deleting rendicion:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo eliminar la rendición" },
      { status: 500 },
    );
  }
}
