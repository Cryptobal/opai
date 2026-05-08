/**
 * API Route: POST /api/finance/billing/issued/bulk-mark-paid
 *
 * Marca múltiples DTEs como pagados (paymentStatus = "PAID",
 * amountPaid = totalAmount, amountPending = 0). Operación administrativa.
 *
 * Auth: requiere facturacion_configure (no es una emisión).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
  parseBody,
} from "@/lib/api-auth";
import { hasFacturacionCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

const bodySchema = z.object({
  dteIds: z.array(z.string().uuid()).min(1).max(100),
  markAt: z.string().datetime().optional(),
});

export async function POST(request: NextRequest) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (!hasFacturacionCapability(perms, "facturacion_configure")) {
    return NextResponse.json(
      { success: false, error: "No tiene permiso para marcar pagos" },
      { status: 403 },
    );
  }

  const parsed = await parseBody(request, bodySchema);
  if (parsed.error) return parsed.error;

  const { dteIds } = parsed.data;

  const owned = await prisma.financeDte.findMany({
    where: {
      tenantId: ctx.tenantId,
      direction: "ISSUED",
      id: { in: dteIds },
    },
    select: { id: true, totalAmount: true, paymentStatus: true },
  });

  const updated: string[] = [];
  for (const dte of owned) {
    await prisma.financeDte.update({
      where: { id: dte.id },
      data: {
        paymentStatus: "PAID",
        amountPaid: dte.totalAmount,
        amountPending: 0,
      },
    });
    updated.push(dte.id);
  }

  await logAudit({
    userId: ctx.userId,
    tenantId: ctx.tenantId,
    action: "UPDATE",
    entity: "FinanceDte",
    details: {
      operation: "bulk_mark_paid",
      updated: updated.length,
      dteIds: updated,
    },
    request,
  });

  return NextResponse.json({
    success: true,
    data: {
      updated: updated.length,
      requested: dteIds.length,
    },
  });
}
