import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
  parseBody,
} from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import {
  hideTransaction,
  unhideTransaction,
} from "@/modules/finance/banking/bank-transaction.service";

const patchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("hide"),
    reason: z.string().trim().min(1, "Motivo requerido").max(500),
  }),
  z.object({
    action: z.literal("unhide"),
  }),
]);

/**
 * PATCH /api/finance/banking/transactions/[id]
 * Acciones:
 *   { action: "hide", reason: string } — soft-delete con motivo
 *   { action: "unhide" } — restaurar
 */
export async function PATCH(
  request: NextRequest,
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
    const parsed = await parseBody(request, patchSchema);
    if (parsed.error) return parsed.error;

    if (parsed.data.action === "hide") {
      await hideTransaction(ctx.tenantId, id, ctx.userId, parsed.data.reason);
    } else {
      await unhideTransaction(ctx.tenantId, id);
    }
    return NextResponse.json({ success: true, data: { ok: true } });
  } catch (error) {
    console.error("[Finance/Banking/Transactions] PATCH error:", error);
    const message =
      error instanceof Error ? error.message : "Error al actualizar movimiento";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
