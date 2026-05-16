import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
  parseBody,
} from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";
import { createItemFromBankTxSchema } from "@/lib/validations/cashflow";

/**
 * POST /api/finance/cashflow/items/from-bank-tx
 *
 * Crea un FinanceCashflowItem (recurrente o puntual) a partir de un bank tx
 * no clasificado. En una sola transacción:
 *   1) Crea el item con recurrence configurable.
 *   2) Crea una FinanceCashflowOccurrence con status=PAID en la fecha del
 *      bank tx (con actualAmountClp = monto absoluto del tx).
 *   3) Vincula la occurrence al bank tx (bankTransactionId).
 *   4) Marca el bank tx como reconciliationStatus=MATCHED.
 *
 * Usado por el drawer de cierre semanal para "meter al flujo" un movimiento
 * bancario inesperado como recurrente nuevo o puntual.
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

  const tx = await prisma.financeBankTransaction.findFirst({
    where: {
      id: input.bankTransactionId,
      tenantId: ctx.tenantId,
      hiddenAt: null,
    },
    select: {
      id: true,
      amount: true,
      transactionDate: true,
      description: true,
    },
  });
  if (!tx) {
    return NextResponse.json(
      { success: false, error: "Movimiento bancario no encontrado" },
      { status: 404 },
    );
  }

  const usedAsOcc = await prisma.financeCashflowOccurrence.findFirst({
    where: { tenantId: ctx.tenantId, bankTransactionId: tx.id },
    select: { id: true },
  });
  if (usedAsOcc) {
    return NextResponse.json(
      {
        success: false,
        error: "Ese movimiento bancario ya está vinculado a otra ocurrencia",
      },
      { status: 409 },
    );
  }

  const category = await prisma.financeCashflowCategory.findFirst({
    where: { id: input.categoryId, tenantId: ctx.tenantId, isActive: true },
    select: { id: true, kind: true },
  });
  if (!category) {
    return NextResponse.json(
      { success: false, error: "Categoría no encontrada" },
      { status: 404 },
    );
  }

  const txAmount = Number(tx.amount);
  const absAmount = Math.abs(input.amountClp ?? txAmount);
  const txDate = new Date(
    tx.transactionDate.getUTCFullYear(),
    tx.transactionDate.getUTCMonth(),
    tx.transactionDate.getUTCDate(),
  );

  const result = await prisma.$transaction(async (db) => {
    const item = await db.financeCashflowItem.create({
      data: {
        tenantId: ctx.tenantId,
        categoryId: category.id,
        kind: category.kind,
        source: "MANUAL",
        name: input.name,
        amount: new Decimal(absAmount),
        currency: "CLP",
        recurrence: input.recurrence,
        startDate: txDate,
        isActive: true,
        installationId: input.installationId ?? null,
        notes: input.notes ?? null,
        createdBy: ctx.userId ?? undefined,
      },
    });

    const occurrence = await db.financeCashflowOccurrence.create({
      data: {
        tenantId: ctx.tenantId,
        itemId: item.id,
        scheduledDate: txDate,
        effectiveDate: txDate,
        amountClp: new Decimal(absAmount),
        status: "PAID",
        bankTransactionId: tx.id,
        matchedAt: new Date(),
        matchedBy: ctx.userId ?? undefined,
        notes: `Creada desde mov banco no clasificado: ${tx.description}`,
      },
    });

    await db.financeBankTransaction.update({
      where: { id: tx.id },
      data: { reconciliationStatus: "MATCHED" },
    });

    return { itemId: item.id, occurrenceId: occurrence.id };
  });

  revalidatePath("/finanzas/flujo-caja");
  return NextResponse.json({ success: true, data: result }, { status: 201 });
}
