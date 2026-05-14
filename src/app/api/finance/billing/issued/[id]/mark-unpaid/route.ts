/**
 * POST /api/finance/billing/issued/[id]/mark-unpaid
 *
 * Revierte un DTE marcado como pagado: `paymentStatus = UNPAID`,
 * `amountPaid = 0`, `amountPending = totalAmount`. Útil cuando se marcó
 * por error (típico: import Zoho que mete todo PAID).
 *
 * Si el DTE tiene conciliaciones bancarias (FinancePaymentAllocation),
 * falla con 409 — el usuario tiene que desconciliar primero. Esto
 * evita inconsistencias del tipo "UNPAID pero linkado a movimiento".
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
      { success: false, error: "Sin permisos para desmarcar pago" },
      { status: 403 },
    );
  }
  const { id } = await params;

  const dte = await prisma.financeDte.findFirst({
    where: { id, tenantId: ctx.tenantId, direction: "ISSUED" },
    select: { id: true, totalAmount: true, paymentStatus: true },
  });
  if (!dte) {
    return NextResponse.json(
      { success: false, error: "DTE no encontrado" },
      { status: 404 },
    );
  }

  const allocCount = await prisma.financePaymentAllocation.count({
    where: { tenantId: ctx.tenantId, dteId: dte.id },
  });
  if (allocCount > 0) {
    return NextResponse.json(
      {
        success: false,
        error:
          "El DTE tiene conciliación bancaria asociada. Desconciliá primero y después podés marcarlo como sin pagar.",
      },
      { status: 409 },
    );
  }

  await prisma.financeDte.update({
    where: { id: dte.id },
    data: {
      paymentStatus: "UNPAID",
      amountPaid: 0,
      amountPending: dte.totalAmount,
    },
  });

  await logAudit({
    userId: ctx.userId,
    tenantId: ctx.tenantId,
    action: "UPDATE",
    entity: "FinanceDte",
    entityId: dte.id,
    details: {
      operation: "mark_unpaid",
      previousStatus: dte.paymentStatus,
    },
    request,
  });

  return NextResponse.json({ success: true, data: { id: dte.id } });
}
