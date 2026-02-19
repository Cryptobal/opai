import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseBody, requireAuth, unauthorized } from "@/lib/api-auth";
import { createOpsAuditLog, ensureOpsAccess } from "@/lib/ops";
import { updateRefuerzoSchema } from "@/lib/validations/ops";
import { calculateEstimatedTotalClp } from "@/lib/ops-refuerzos";

type Params = { id: string };

export async function PATCH(request: NextRequest, { params }: { params: Promise<Params> }) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { id } = await params;
    const parsed = await parseBody(request, updateRefuerzoSchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    const existing = await prisma.opsRefuerzoSolicitud.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: { turnoExtra: { select: { id: true } } },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Solicitud no encontrada" }, { status: 404 });
    }

    const nextStartAt = body.startAt ? new Date(body.startAt) : existing.startAt;
    const nextEndAt = body.endAt ? new Date(body.endAt) : existing.endAt;
    const nextGuardsCount = body.guardsCount ?? existing.guardsCount;
    const nextRateMode = body.rateMode ?? (existing.rateMode as "hora" | "turno");
    const nextRateClp = body.rateClp ?? (existing.rateClp ? Number(existing.rateClp) : 0);

    const estimatedTotalClp =
      body.estimatedTotalClp ??
      calculateEstimatedTotalClp({
        guardsCount: nextGuardsCount,
        startAt: nextStartAt,
        endAt: nextEndAt,
        rateMode: nextRateMode,
        rateClp: nextRateClp,
      });

    const nextStatus = body.status ?? existing.status;
    const updateData: Record<string, unknown> = {
      ...(body.guardiaId !== undefined ? { guardiaId: body.guardiaId } : {}),
      ...(body.puestoId !== undefined ? { puestoId: body.puestoId } : {}),
      ...(body.startAt !== undefined ? { startAt: nextStartAt } : {}),
      ...(body.endAt !== undefined ? { endAt: nextEndAt } : {}),
      ...(body.guardsCount !== undefined ? { guardsCount: body.guardsCount } : {}),
      ...(body.shiftType !== undefined ? { shiftType: body.shiftType } : {}),
      ...(body.locationText !== undefined ? { locationText: body.locationText } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
      ...(body.rateMode !== undefined ? { rateMode: body.rateMode } : {}),
      ...(body.rateClp !== undefined ? { rateClp: body.rateClp } : {}),
      estimatedTotalClp,
      ...(body.paymentCondition !== undefined ? { paymentCondition: body.paymentCondition } : {}),
      ...(body.guardPaymentClp !== undefined ? { guardPaymentClp: body.guardPaymentClp } : {}),
      ...(body.invoiceNumber !== undefined ? { invoiceNumber: body.invoiceNumber } : {}),
      ...(body.invoiceRef !== undefined ? { invoiceRef: body.invoiceRef } : {}),
      status: nextStatus,
    };

    if (nextStatus === "facturado") {
      updateData.invoicedAt = body.invoicedAt ? new Date(body.invoicedAt) : new Date();
    } else if (body.invoicedAt !== undefined) {
      updateData.invoicedAt = body.invoicedAt ? new Date(body.invoicedAt) : null;
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (existing.turnoExtraId) {
        await tx.opsTurnoExtra.update({
          where: { id: existing.turnoExtraId },
          data: {
            ...(body.guardiaId !== undefined ? { guardiaId: body.guardiaId } : {}),
            ...(body.puestoId !== undefined ? { puestoId: body.puestoId } : {}),
            ...(body.guardPaymentClp !== undefined ? { amountClp: body.guardPaymentClp } : {}),
          },
        });
      }

      if (nextStatus === "facturado" && existing.turnoExtraId) {
        await tx.opsTurnoExtra.update({
          where: { id: existing.turnoExtraId },
          data: { status: "paid", paidAt: new Date() },
        });
      }

      return tx.opsRefuerzoSolicitud.update({
        where: { id },
        data: updateData,
        include: {
          installation: { select: { id: true, name: true } },
          account: { select: { id: true, name: true } },
          puesto: { select: { id: true, name: true } },
          guardia: {
            select: {
              id: true,
              code: true,
              persona: { select: { firstName: true, lastName: true, rut: true } },
            },
          },
          turnoExtra: { select: { id: true, status: true, amountClp: true, paidAt: true } },
        },
      });
    });

    await createOpsAuditLog(ctx, "ops.refuerzo.updated", "ops_refuerzo_solicitud", id, {
      status: nextStatus,
      invoiceNumber: body.invoiceNumber,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("[OPS] Error updating refuerzo:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo actualizar la solicitud" },
      { status: 500 }
    );
  }
}
