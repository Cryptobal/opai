/**
 * POST /api/finance/billing/issued/[id]/unreconcile
 *
 * Desconcilia un DTE: borra las FinancePaymentAllocation que linkean el
 * DTE a movimientos bancarios. Si el FinancePaymentRecord queda sin
 * allocations, también se borra (junto con el link al bankTransaction).
 *
 * NO toca `paymentStatus`. Caso típico: el usuario marcó la factura
 * como pagada manualmente y después la auto-concilió con el movimiento
 * equivocado; quiere romper ese link sin perder el "pagada".
 *
 * Auth: facturacion_configure.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
} from "@/lib/api-auth";
import { hasFacturacionCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (!hasFacturacionCapability(perms, "facturacion_configure")) {
    return NextResponse.json(
      { success: false, error: "Sin permisos para desconciliar" },
      { status: 403 },
    );
  }
  const { id } = await params;

  const dte = await prisma.financeDte.findFirst({
    where: { id, tenantId: ctx.tenantId, direction: "ISSUED" },
    select: { id: true },
  });
  if (!dte) {
    return NextResponse.json(
      { success: false, error: "DTE no encontrado" },
      { status: 404 },
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    // FinancePaymentAllocation no tiene tenantId directo; ya verificamos
    // que el DTE pertenece al tenant arriba.
    const allocations = await tx.financePaymentAllocation.findMany({
      where: { dteId: dte.id },
      select: { id: true, paymentId: true, amount: true },
    });
    if (allocations.length === 0) {
      return { removed: 0, paymentsDeleted: 0 };
    }

    await tx.financePaymentAllocation.deleteMany({
      where: { id: { in: allocations.map((a) => a.id) } },
    });

    // Si quedó un FinancePaymentRecord huérfano (sin allocations), lo
    // borramos para no dejar pagos fantasma. Cualquier bankTransaction
    // sigue intacto — solo se rompe el link.
    const paymentIds = Array.from(new Set(allocations.map((a) => a.paymentId)));
    let paymentsDeleted = 0;
    for (const pid of paymentIds) {
      const remaining = await tx.financePaymentAllocation.count({
        where: { paymentId: pid },
      });
      if (remaining === 0) {
        await tx.financePaymentRecord.delete({ where: { id: pid } });
        paymentsDeleted += 1;
      }
    }

    return { removed: allocations.length, paymentsDeleted };
  });

  await logAudit({
    userId: ctx.userId,
    tenantId: ctx.tenantId,
    action: "UPDATE",
    entity: "FinanceDte",
    entityId: dte.id,
    details: {
      operation: "unreconcile",
      allocationsRemoved: result.removed,
      paymentsDeleted: result.paymentsDeleted,
    },
    request,
  });

  return NextResponse.json({ success: true, data: result });
}
