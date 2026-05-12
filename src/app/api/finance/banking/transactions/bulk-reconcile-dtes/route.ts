import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
  parseBody,
} from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { bulkReconcileToDtes } from "@/modules/finance/banking/bank-tx-link.service";

const schema = z.object({
  bankTransactionIds: z.array(z.string().uuid()).min(1).max(50),
  allocations: z
    .array(
      z.object({
        dteId: z.string().uuid(),
        amount: z.number().positive(),
      })
    )
    .min(1)
    .max(20),
});

/**
 * POST /api/finance/banking/transactions/bulk-reconcile-dtes
 *
 * Concilia N movimientos contra M DTEs en una sola operación atómica.
 * Cada mov genera 1 PaymentRecord cuyo monto se reparte proporcionalmente
 * entre los DTEs según el peso de cada allocation.
 *
 * Body: { bankTransactionIds: string[], allocations: [{ dteId, amount }] }
 *
 * Caso típico: 1 depósito de factoring (neto) cubriendo M facturas cedidas
 * (brutas). El usuario decide cuánto se asigna a cada factura.
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "banking_manage")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 }
      );
    }
    const parsed = await parseBody(request, schema);
    if (parsed.error) return parsed.error;

    const result = await bulkReconcileToDtes(
      ctx.tenantId,
      ctx.userId,
      parsed.data
    );
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("[Finance/Banking/BulkReconcileDtes] Error:", error);
    const message =
      error instanceof Error ? error.message : "Error al conciliar";
    return NextResponse.json(
      { success: false, error: message },
      { status: 400 }
    );
  }
}
