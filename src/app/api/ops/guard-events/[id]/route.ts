import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized, ensureCanDelete } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import { prisma } from "@/lib/prisma";
import { EVENT_SUBTYPES, getSubtypeLabel, getCategoryLabel } from "@/lib/guard-events";

type Params = { id: string };

/**
 * GET /api/ops/guard-events/[id] — Get event detail
 */
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

    const event = await prisma.opsGuardEvent.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });

    if (!event) {
      return NextResponse.json(
        { success: false, error: "Evento no encontrado" },
        { status: 404 },
      );
    }

    // Fetch associated documents via DocAssociation
    const associations = await prisma.docAssociation.findMany({
      where: { entityType: "guard_event", entityId: id },
      include: {
        document: {
          select: {
            id: true,
            title: true,
            status: true,
            category: true,
            createdAt: true,
            templateId: true,
            template: { select: { name: true } },
          },
        },
      },
    });

    const documents = associations.map((a) => ({
      id: a.id,
      documentId: a.document.id,
      title: a.document.title,
      status: a.document.status === "draft" ? "generated" : a.document.status,
      templateName: a.document.template?.name ?? null,
      createdAt: a.document.createdAt.toISOString(),
    }));

    return NextResponse.json({
      success: true,
      data: {
        ...event,
        attachments: (event.attachments as any[]) ?? [],
        metadata: (event.metadata as Record<string, unknown>) ?? {},
        vacationPaymentAmount: event.vacationPaymentAmount ? Number(event.vacationPaymentAmount) : null,
        pendingRemunerationAmount: event.pendingRemunerationAmount ? Number(event.pendingRemunerationAmount) : null,
        yearsOfServiceAmount: event.yearsOfServiceAmount ? Number(event.yearsOfServiceAmount) : null,
        substituteNoticeAmount: event.substituteNoticeAmount ? Number(event.substituteNoticeAmount) : null,
        totalSettlementAmount: event.totalSettlementAmount ? Number(event.totalSettlementAmount) : null,
        documents,
      },
    });
  } catch (error) {
    console.error("[OPS] Error fetching guard event:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo obtener el evento laboral" },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/ops/guard-events/[id] — Update event (only draft/pending)
 */
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

    const existing = await prisma.opsGuardEvent.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Evento no encontrado" },
        { status: 404 },
      );
    }

    // Allow cancelling approved ausencias (reverts pauta shiftCodes)
    const isCancellation =
      body.status === "cancelled" &&
      existing.status === "approved" &&
      existing.category === "ausencia";

    if (!isCancellation && !["draft", "pending"].includes(existing.status)) {
      return NextResponse.json(
        { success: false, error: "Solo se pueden editar eventos en borrador o pendiente" },
        { status: 400 },
      );
    }

    const updateData: any = {};
    // For cancellation of approved events, only allow status change
    if (!isCancellation) {
      if (body.startDate !== undefined) updateData.startDate = body.startDate ? new Date(body.startDate) : null;
      if (body.endDate !== undefined) updateData.endDate = body.endDate ? new Date(body.endDate) : null;
      if (body.finiquitoDate !== undefined) updateData.finiquitoDate = body.finiquitoDate ? new Date(body.finiquitoDate) : null;
      if (body.totalDays !== undefined) updateData.totalDays = body.totalDays;
      if (body.causalDtCode !== undefined) updateData.causalDtCode = body.causalDtCode;
      if (body.causalDtLabel !== undefined) updateData.causalDtLabel = body.causalDtLabel;
      if (body.reason !== undefined) updateData.reason = body.reason;
      if (body.internalNotes !== undefined) updateData.internalNotes = body.internalNotes;
      if (body.vacationDaysPending !== undefined) updateData.vacationDaysPending = body.vacationDaysPending;
      if (body.vacationPaymentAmount !== undefined) updateData.vacationPaymentAmount = body.vacationPaymentAmount;
      if (body.pendingRemunerationAmount !== undefined) updateData.pendingRemunerationAmount = body.pendingRemunerationAmount;
      if (body.yearsOfServiceAmount !== undefined) updateData.yearsOfServiceAmount = body.yearsOfServiceAmount;
      if (body.substituteNoticeAmount !== undefined) updateData.substituteNoticeAmount = body.substituteNoticeAmount;
      if (body.totalSettlementAmount !== undefined) updateData.totalSettlementAmount = body.totalSettlementAmount;
    }
    if (body.status !== undefined) updateData.status = body.status;
    if (isCancellation) {
      updateData.cancelledBy = ctx.userId;
      updateData.cancelledAt = new Date();
    }

    // Revert pauta shiftCodes when cancelling an approved ausencia
    if (isCancellation && existing.startDate && existing.endDate) {
      const subtypeDef = EVENT_SUBTYPES.ausencia.find((s) => s.value === existing.subtype);
      const absenceCode = subtypeDef?.shiftCode;
      if (absenceCode) {
        // Revert shiftCode to "T" and clear replacement/guardEvent links
        await prisma.opsPautaMensual.updateMany({
          where: {
            tenantId: ctx.tenantId,
            guardEventId: id,
            date: { gte: existing.startDate, lte: existing.endDate },
            shiftCode: absenceCode,
          },
          data: {
            shiftCode: "T",
            guardEventId: null,
            replacementGuardiaId: null,
            replacementReason: null,
          },
        });

        // Also clean affected asistencia rows so they get re-synced
        await prisma.opsAsistenciaDiaria.deleteMany({
          where: {
            tenantId: ctx.tenantId,
            plannedGuardiaId: existing.guardiaId,
            date: { gte: existing.startDate, lte: existing.endDate },
            attendanceStatus: { in: ["pendiente", "ppc"] },
            lockedAt: null,
          },
        });
      }
    }

    const updated = await prisma.opsGuardEvent.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      data: {
        ...updated,
        attachments: (updated.attachments as any[]) ?? [],
        metadata: (updated.metadata as Record<string, unknown>) ?? {},
        vacationPaymentAmount: updated.vacationPaymentAmount ? Number(updated.vacationPaymentAmount) : null,
        pendingRemunerationAmount: updated.pendingRemunerationAmount ? Number(updated.pendingRemunerationAmount) : null,
        yearsOfServiceAmount: updated.yearsOfServiceAmount ? Number(updated.yearsOfServiceAmount) : null,
        substituteNoticeAmount: updated.substituteNoticeAmount ? Number(updated.substituteNoticeAmount) : null,
        totalSettlementAmount: updated.totalSettlementAmount ? Number(updated.totalSettlementAmount) : null,
      },
    });
  } catch (error) {
    console.error("[OPS] Error updating guard event:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo actualizar el evento laboral" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/ops/guard-events/[id] — Delete event
 * Requires full permission on ops.eventos_laborales (admin, owner, editor).
 * If the event was an approved ausencia, reverts pauta cells back to "T".
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;
    const deleteForbidden = await ensureCanDelete(ctx, "ops", "eventos_laborales");
    if (deleteForbidden) return deleteForbidden;

    const { id } = await params;

    const event = await prisma.opsGuardEvent.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });

    if (!event) {
      return NextResponse.json(
        { success: false, error: "Evento no encontrado" },
        { status: 404 },
      );
    }

    // If ausencia was approved and had dates, revert pauta cells
    if (
      event.category === "ausencia" &&
      event.status === "approved" &&
      event.startDate &&
      event.endDate
    ) {
      const subtypeDef = EVENT_SUBTYPES.ausencia.find((s) => s.value === event.subtype);
      const shiftCode = subtypeDef?.shiftCode;
      if (shiftCode) {
        await prisma.opsPautaMensual.updateMany({
          where: {
            tenantId: ctx.tenantId,
            plannedGuardiaId: event.guardiaId,
            date: { gte: event.startDate, lte: event.endDate },
            shiftCode,
          },
          data: { shiftCode: "T" },
        });
      }
    }

    const subtypeLabel = getSubtypeLabel(event.subtype as any);
    const categoryLabel = getCategoryLabel(event.category as any);

    await prisma.opsGuardEvent.delete({
      where: { id },
    });

    await prisma.opsGuardiaHistory.create({
      data: {
        tenantId: ctx.tenantId,
        guardiaId: event.guardiaId,
        eventType: "labor_event_deleted",
        previousValue: {
          category: event.category,
          subtype: event.subtype,
          startDate: event.startDate?.toISOString(),
          endDate: event.endDate?.toISOString(),
          finiquitoDate: event.finiquitoDate?.toISOString(),
        },
        reason: `${categoryLabel} eliminado/a: ${subtypeLabel}`,
        createdBy: ctx.userId,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[OPS] Error deleting guard event:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo eliminar el evento laboral" },
      { status: 500 },
    );
  }
}
