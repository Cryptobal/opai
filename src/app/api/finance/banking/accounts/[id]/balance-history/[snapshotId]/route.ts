import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
} from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { deleteBalanceSnapshot } from "@/modules/finance/banking/bank-balance.service";

/**
 * DELETE /api/finance/banking/accounts/[id]/balance-history/[snapshotId]
 * Elimina un snapshot de saldo. Recalcula `currentBalance` con el siguiente
 * snapshot más reciente.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; snapshotId: string }> }
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
    const { id, snapshotId } = await params;
    await deleteBalanceSnapshot(ctx.tenantId, id, snapshotId);
    return NextResponse.json({ success: true, data: { deleted: true } });
  } catch (error) {
    console.error("[Finance/Banking/Balance] DELETE error:", error);
    const message =
      error instanceof Error ? error.message : "Error al eliminar snapshot";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
