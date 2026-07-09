import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
  parseBody,
} from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import {
  assignBankTxToCategory,
  AssignToCategoryError,
} from "@/modules/finance/cashflow/assign-to-category.service";

const bulkFromBankTxSchema = z.object({
  bankTransactionIds: z.array(z.string().uuid()).min(1).max(200),
  categoryId: z.string().uuid(),
});

/**
 * POST /api/finance/cashflow/items/from-bank-tx/bulk
 *
 * Asigna N movimientos bancarios a una misma categoría de flujo de caja.
 * Llama al motor `assignBankTxToCategory` por cada tx (cada uno resuelve su
 * propia semana y su propio consumo de proyectado — pueden caer en semanas
 * distintas). Un tx ya vinculado NO aborta el lote: va a `skipped`.
 *
 * Devuelve un resumen: cuántos consumieron proyectado, cuántos se crearon
 * como real puro, y cuáles se saltaron y por qué.
 */
export async function POST(req: NextRequest) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (!hasCapability(perms, "cashflow_manage")) {
    return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
  }
  const parsed = await parseBody(req, bulkFromBankTxSchema);
  if (parsed.error) return parsed.error;
  const { bankTransactionIds, categoryId } = parsed.data;

  let consumed = 0;
  let created = 0;
  const skipped: Array<{ id: string; reason: string }> = [];

  // Secuencial: cada asignación abre su propia $transaction y puede consumir
  // la misma proyección semanal, así que evitamos carreras entre txs del lote.
  for (const id of bankTransactionIds) {
    try {
      const r = await assignBankTxToCategory(ctx.tenantId, ctx.userId ?? null, {
        bankTransactionId: id,
        categoryId,
      });
      if (r.mode === "consumed") consumed++;
      else created++;
    } catch (err) {
      const reason =
        err instanceof AssignToCategoryError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Error";
      skipped.push({ id, reason });
    }
  }

  revalidatePath("/finanzas/flujo-caja");
  return NextResponse.json({
    success: true,
    data: { consumed, created, skipped, total: bankTransactionIds.length },
  });
}
