import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import { prisma } from "@/lib/prisma";

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

    if (!["draft", "pending"].includes(existing.status)) {
      return NextResponse.json(
        { success: false, error: "Solo se pueden editar eventos en borrador o pendiente" },
        { status: 400 },
      );
    }

    const updateData: any = {};
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
    if (body.status !== undefined) updateData.status = body.status;

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
