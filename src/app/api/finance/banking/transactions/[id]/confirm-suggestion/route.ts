import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
} from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { confirmSuggestion } from "@/modules/finance/banking/bank-tx-link.service";

/**
 * POST /api/finance/banking/transactions/[id]/confirm-suggestion
 * Autoriza la sugerencia de regla pendiente de una tx.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
    const { id } = await params;
    const result = await confirmSuggestion(ctx.tenantId, id, ctx.userId);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("[Finance/Banking/ConfirmSuggestion] error:", error);
    const message =
      error instanceof Error ? error.message : "Error al autorizar";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
