import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
  parseBody,
} from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { bulkReconcileToDte } from "@/modules/finance/banking/bank-tx-link.service";

const schema = z.object({
  bankTransactionIds: z.array(z.string().uuid()).min(1).max(50),
  dteId: z.string().uuid(),
});

/**
 * POST /api/finance/banking/transactions/bulk-reconcile-dte
 *
 * Concilia N movimientos bancarios contra 1 DTE (cobro o pago) en una
 * sola operación atómica. Usado por el dialog "Conciliar contra 1 DTE"
 * de la barra de acciones masivas en /finanzas/bancos.
 *
 * Body: { bankTransactionIds: string[], dteId: string }
 *
 * El service valida:
 *   - mismo tenant
 *   - mismo signo (todos ingresos o todos egresos)
 *   - ningún mov ya conciliado
 *   - suma ≤ amountPending del DTE
 *
 * Devuelve `paymentRecordCode` para mostrar toast con link al recibo.
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

    const result = await bulkReconcileToDte(
      ctx.tenantId,
      ctx.userId,
      parsed.data
    );
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("[Finance/Banking/BulkReconcileDte] Error:", error);
    const message =
      error instanceof Error ? error.message : "Error al conciliar masivamente";
    return NextResponse.json(
      { success: false, error: message },
      { status: 400 }
    );
  }
}
