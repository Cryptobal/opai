import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
  parseBody,
} from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { bulkHideTransactions } from "@/modules/finance/banking/bank-transaction.service";

const bulkHideSchema = z.object({
  bankTransactionIds: z.array(z.string().uuid()).min(1).max(500),
  reason: z.string().trim().min(1, "Motivo requerido").max(500),
});

/**
 * POST /api/finance/banking/transactions/bulk-hide
 * Oculta múltiples movimientos en una sola operación. Ignora silenciosamente
 * los que ya están ocultos. Devuelve `{ hidden: number }` con la cantidad
 * efectivamente afectada.
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
    const parsed = await parseBody(request, bulkHideSchema);
    if (parsed.error) return parsed.error;
    const { bankTransactionIds, reason } = parsed.data;

    const hidden = await bulkHideTransactions(
      ctx.tenantId,
      bankTransactionIds,
      ctx.userId,
      reason
    );

    return NextResponse.json({ success: true, data: { hidden } });
  } catch (error) {
    console.error("[Finance/Banking/BulkHide] error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Error al ocultar",
      },
      { status: 500 }
    );
  }
}
