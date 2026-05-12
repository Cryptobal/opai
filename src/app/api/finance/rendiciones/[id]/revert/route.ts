// Reversión administrativa de estado de una rendición.
//
// Permite a un admin con capability `rendicion_configure` deshacer transiciones
// como PAID→APPROVED, APPROVED→SUBMITTED, etc. Cuando la rendición venía de PAID
// y era la única vinculada al pago, se marca el FinancePayment como cancelado.
// Cuando quedan otras rendiciones en el pago, se recalculan totalAmount/rendicionCount.
//
// Todas las transiciones quedan registradas en FinanceRendicionHistory con
// action="REVERTED" y metadata del pago previo si aplica.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
  parseBody,
} from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { z } from "zod";

type Params = { id: string };

const revertSchema = z.object({
  toStatus: z.enum(["DRAFT", "SUBMITTED", "APPROVED"]),
  reason: z
    .string()
    .min(10, "El motivo debe tener al menos 10 caracteres")
    .max(500),
});

const VALID_TRANSITIONS: Record<string, string[]> = {
  PAID: ["APPROVED", "SUBMITTED", "DRAFT"],
  APPROVED: ["SUBMITTED", "DRAFT"],
  SUBMITTED: ["DRAFT"],
  IN_APPROVAL: ["SUBMITTED", "DRAFT"],
  REJECTED: ["DRAFT"],
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    if (!hasCapability(perms, "rendicion_configure")) {
      return NextResponse.json(
        {
          success: false,
          error: "Sin permisos para revertir estados de rendiciones",
        },
        { status: 403 },
      );
    }

    const { id } = await params;
    const parsed = await parseBody(request, revertSchema);
    if (parsed.error) return parsed.error;
    const { toStatus, reason } = parsed.data;

    const rendicion = await prisma.financeRendicion.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: {
        approvals: true,
        payment: {
          include: { rendiciones: { select: { id: true } } },
        },
      },
    });

    if (!rendicion) {
      return NextResponse.json(
        { success: false, error: "Rendición no encontrada" },
        { status: 404 },
      );
    }

    const fromStatus = rendicion.status;
    const allowed = VALID_TRANSITIONS[fromStatus] ?? [];
    if (!allowed.includes(toStatus)) {
      return NextResponse.json(
        {
          success: false,
          error: `No se puede revertir de ${fromStatus} a ${toStatus}. Transiciones válidas: ${
            allowed.join(", ") || "(ninguna)"
          }`,
        },
        { status: 400 },
      );
    }

    const previousPaymentId = rendicion.paymentId;
    const previousPaymentCode = rendicion.payment?.code ?? null;

    const result = await prisma.$transaction(async (tx) => {
      let paymentCancelled: string | null = null;

      // 1. Si venía de PAID: desvincular del pago. Cancelar o recalcular.
      if (fromStatus === "PAID" && rendicion.paymentId && rendicion.payment) {
        const remaining = rendicion.payment.rendiciones.filter(
          (r) => r.id !== rendicion.id,
        );

        if (remaining.length === 0) {
          // Era la única rendición: marcar pago como cancelado.
          await tx.financePayment.update({
            where: { id: rendicion.paymentId },
            data: {
              cancelled: true,
              cancelledAt: new Date(),
              cancelledReason: reason,
              cancelledById: ctx.userId,
            },
          });
          paymentCancelled = rendicion.payment.code;
        } else {
          // Quedan otros items: recalcular totales (sin contar la rendición revertida).
          const newTotal = await tx.financeRendicion.aggregate({
            where: {
              paymentId: rendicion.paymentId,
              id: { not: rendicion.id },
            },
            _sum: { amount: true },
            _count: true,
          });
          await tx.financePayment.update({
            where: { id: rendicion.paymentId },
            data: {
              totalAmount: newTotal._sum.amount ?? 0,
              rendicionCount: newTotal._count,
            },
          });
        }
      }

      // 2. Manejo de approvals según destino.
      //    APPROVED/IN_APPROVAL → SUBMITTED: resetear decisiones (vuelven a pendientes).
      //    Cualquier estado → DRAFT: borrar approvals (al re-enviar se recrean).
      if (toStatus === "DRAFT") {
        await tx.financeApproval.deleteMany({ where: { rendicionId: id } });
      } else if (
        toStatus === "SUBMITTED" &&
        ["APPROVED", "IN_APPROVAL", "PAID"].includes(fromStatus)
      ) {
        await tx.financeApproval.updateMany({
          where: { rendicionId: id, decision: { not: null } },
          data: { decision: null, decidedAt: null, comment: null },
        });
      }

      // 3. Actualizar la rendición.
      const updateData: {
        status: string;
        paymentId?: null;
        paidAt?: null;
        paymentMethod?: null;
        submittedAt?: null;
        rejectedAt?: null;
        rejectionReason?: null;
        rejectedById?: null;
      } = { status: toStatus };

      if (fromStatus === "PAID") {
        updateData.paymentId = null;
        updateData.paidAt = null;
        updateData.paymentMethod = null;
      }
      if (toStatus === "DRAFT") {
        updateData.submittedAt = null;
        updateData.rejectedAt = null;
        updateData.rejectionReason = null;
        updateData.rejectedById = null;
      }

      const updated = await tx.financeRendicion.update({
        where: { id },
        data: updateData,
      });

      // 4. Audit log.
      await tx.financeRendicionHistory.create({
        data: {
          rendicionId: id,
          action: "REVERTED",
          fromStatus,
          toStatus,
          userId: ctx.userId,
          userName: ctx.userEmail,
          comment: reason,
          metadata: {
            revertedBy: ctx.userEmail,
            paymentCancelled,
            previousPaymentId: previousPaymentId ?? null,
            previousPaymentCode,
          },
        },
      });

      return { updated, paymentCancelled };
    });

    // Notificar al submitter (fire-and-forget).
    try {
      const { notify } = await import("@/lib/notifications/notify");
      await notify({
        tenantId: ctx.tenantId,
        type: "expense_report_reverted",
        targetIds: [rendicion.submitterId],
        targetType: "ADMIN",
        title: "Rendición revertida por administrador",
        body: `${rendicion.code} fue revertida de ${fromStatus} a ${toStatus}. Motivo: ${reason}`,
        link: `/finanzas/rendiciones/${id}`,
        data: {
          rendicionId: id,
          fromStatus,
          toStatus,
          reason,
          paymentCancelled: result.paymentCancelled,
        },
      });
    } catch (err) {
      console.error("[Finance] Error notifying revert:", err);
    }

    return NextResponse.json({
      success: true,
      data: {
        ...result.updated,
        paymentCancelled: result.paymentCancelled,
      },
    });
  } catch (error) {
    console.error("[Finance] Error reverting rendicion:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo revertir la rendición" },
      { status: 500 },
    );
  }
}
