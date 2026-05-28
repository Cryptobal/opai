import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth, unauthorized, resolveApiPerms, parseBody } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { createManualOccurrenceFromBankTx } from "@/modules/finance/cashflow/occurrence.service";

const bodySchema = z.object({
  bankTransactionId: z.string().uuid(),
  name: z.string().min(1).max(200).optional(),
});

/**
 * POST /api/finance/cashflow/occurrences/from-bank-tx
 *
 * "+ Manual" del modal de cuadratura: registra un bank tx pendiente en el flujo
 * como occurrence conciliada (item MANUAL ONCE + occurrence PAID), sin
 * formulario. kind/categoría/monto se derivan del movimiento.
 */
export async function POST(request: NextRequest) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (!hasCapability(perms, "cashflow_manage")) {
    return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
  }
  const parsed = await parseBody(request, bodySchema);
  if (parsed.error) return parsed.error;
  try {
    const occ = await createManualOccurrenceFromBankTx(
      ctx.tenantId,
      ctx.userId,
      parsed.data.bankTransactionId,
      parsed.data.name,
    );
    return NextResponse.json({ success: true, data: { id: occ.id } });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Error" },
      { status: 400 },
    );
  }
}
