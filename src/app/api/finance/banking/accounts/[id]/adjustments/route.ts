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
import { prisma } from "@/lib/prisma";
import { createAdjustmentTransaction } from "@/modules/finance/banking/bank-transaction.service";

const adjustmentSchema = z.object({
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha YYYY-MM-DD"),
  amount: z.number().finite().refine((n) => n !== 0, "El monto debe ser distinto de cero"),
  reason: z.string().trim().min(5, "Motivo requerido (mínimo 5 caracteres)").max(400),
});

/**
 * POST /api/finance/banking/accounts/[id]/adjustments
 *
 * Ajuste de cuadratura explícito: crea un movimiento visible (categoría
 * AJUSTE_CUADRATURA, motivo obligatorio, auditado) que suma o resta al
 * ledger. Último recurso cuando la diferencia con el banco no se explica
 * con un movimiento faltante ni con un duplicado.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasCapability(perms, "banking_manage")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 },
      );
    }
    const { id } = await params;
    const parsed = await parseBody(request, adjustmentSchema);
    if (parsed.error) return parsed.error;

    const account = await prisma.financeBankAccount.findFirst({
      where: { id, tenantId: ctx.tenantId, isActive: true },
      select: { id: true },
    });
    if (!account) {
      return NextResponse.json(
        { success: false, error: "Cuenta bancaria no encontrada" },
        { status: 404 },
      );
    }

    let created: Awaited<ReturnType<typeof createAdjustmentTransaction>>;
    try {
      created = await createAdjustmentTransaction(ctx.tenantId, ctx.userId, {
        bankAccountId: id,
        transactionDate: parsed.data.transactionDate,
        amount: parsed.data.amount,
        reason: parsed.data.reason,
      });
    } catch (err) {
      return NextResponse.json(
        { success: false, error: err instanceof Error ? err.message : "Ajuste inválido" },
        { status: 400 },
      );
    }

    revalidatePath("/finanzas/bancos");
    revalidatePath("/finanzas");
    revalidatePath("/finanzas/flujo-caja");

    return NextResponse.json(
      {
        success: true,
        data: {
          id: created.id,
          transactionDate: created.transactionDate.toISOString().slice(0, 10),
          amount: Number(created.amount),
          description: created.description,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("[Finance/Banking/Adjustments] POST error:", error);
    const message =
      error instanceof Error ? error.message : "Error al crear el ajuste";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
