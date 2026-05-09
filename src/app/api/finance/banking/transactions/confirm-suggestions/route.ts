import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
  parseBody,
} from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { confirmAllSuggestions } from "@/modules/finance/banking/bank-tx-link.service";

const bodySchema = z.object({
  bankAccountId: z.string().nullable().optional(),
  txIds: z.array(z.string()).optional(),
});

/**
 * POST /api/finance/banking/transactions/confirm-suggestions
 * Bulk: autoriza todas las sugerencias pendientes de una cuenta o de
 * un set de IDs específicos.
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
    const parsed = await parseBody(request, bodySchema);
    if (parsed.error) return parsed.error;
    const result = await confirmAllSuggestions(ctx.tenantId, ctx.userId, {
      bankAccountId: parsed.data.bankAccountId ?? undefined,
      txIds: parsed.data.txIds,
    });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("[Finance/Banking/ConfirmAllSuggestions] error:", error);
    const message =
      error instanceof Error ? error.message : "Error en autorización masiva";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
