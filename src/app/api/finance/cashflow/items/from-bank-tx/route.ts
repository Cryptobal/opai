import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
  parseBody,
} from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { createItemFromBankTxSchema } from "@/lib/validations/cashflow";
import {
  assignBankTxToCategory,
  AssignToCategoryError,
} from "@/modules/finance/cashflow/assign-to-category.service";

/**
 * POST /api/finance/cashflow/items/from-bank-tx
 *
 * Asigna un movimiento bancario no clasificado a una categoría de flujo de
 * caja. Delega en el motor único `assignBankTxToCategory`, que aplica la
 * regla "el real CONSUME el proyectado" (Opción A):
 *
 *   - Si la categoría ya tiene una cuota PROYECTADA en la semana del
 *     movimiento, el real la reemplaza (no se suma). `recurrence` se ignora.
 *   - Si no hay proyectado, crea un item nuevo (recurrente o puntual según
 *     `recurrence`) + occurrence PAID. Este es el comportamiento histórico
 *     que usa el drawer de cierre semanal para "meter al flujo" un
 *     movimiento inesperado.
 */
export async function POST(req: NextRequest) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (!hasCapability(perms, "cashflow_manage")) {
    return NextResponse.json(
      { success: false, error: "Sin permisos" },
      { status: 403 },
    );
  }
  const parsed = await parseBody(req, createItemFromBankTxSchema);
  if (parsed.error) return parsed.error;
  const input = parsed.data;

  try {
    const result = await assignBankTxToCategory(ctx.tenantId, ctx.userId ?? null, {
      bankTransactionId: input.bankTransactionId,
      categoryId: input.categoryId,
      name: input.name,
      recurrence: input.recurrence,
      amountClp: input.amountClp,
      installationId: input.installationId ?? null,
      notes: input.notes ?? null,
    });
    revalidatePath("/finanzas/flujo-caja");
    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (err) {
    if (err instanceof AssignToCategoryError) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: err.status },
      );
    }
    throw err;
  }
}
