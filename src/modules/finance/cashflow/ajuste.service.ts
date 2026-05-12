import "server-only";
import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";

export interface CreateAjusteInput {
  /** Monto del ajuste en CLP. Positivo = ingreso al banco; negativo = egreso. */
  amountClp: number;
  /** Fecha efectiva del ajuste (la occurrence quedará materializada en esta fecha). */
  effectiveDate: Date;
  /** Notas obligatorias — auditoría del por qué del ajuste. */
  notes: string;
  /** Opcional: bank tx que justifica el ajuste (queda como referencia). */
  bankTransactionId?: string | null;
}

export interface AjusteResult {
  itemId: string;
  occurrenceId: string;
  categoryCode: "ING_AJUSTE_CONCILIACION" | "EGR_AJUSTE_CONCILIACION";
}

/**
 * Crea un ajuste de conciliación: FinanceCashflowItem con source=AJUSTE,
 * recurrence=ONCE, y una FinanceCashflowOccurrence PAID asociada en la fecha
 * indicada. El monto se interpreta así:
 *   - amountClp > 0 → INCOME, categoría ING_AJUSTE_CONCILIACION
 *   - amountClp < 0 → EXPENSE, categoría EGR_AJUSTE_CONCILIACION
 *
 * Si se pasa `bankTransactionId`, se valida que la tx exista en el tenant y
 * NO esté ya asignada a otra occurrence.
 */
export async function createAjusteConciliacion(
  tenantId: string,
  userId: string | null,
  input: CreateAjusteInput,
): Promise<AjusteResult> {
  if (input.amountClp === 0) {
    throw new Error("El monto del ajuste no puede ser 0");
  }
  if (!input.notes?.trim() || input.notes.trim().length < 5) {
    throw new Error("Las notas son obligatorias (mínimo 5 caracteres)");
  }

  const kind = input.amountClp > 0 ? "INCOME" : "EXPENSE";
  const categoryCode =
    kind === "INCOME"
      ? "ING_AJUSTE_CONCILIACION"
      : "EGR_AJUSTE_CONCILIACION";

  const category = await prisma.financeCashflowCategory.findFirst({
    where: { tenantId, code: categoryCode, isActive: true },
    select: { id: true },
  });
  if (!category) {
    throw new Error(
      `Categoría sistema ${categoryCode} no encontrada. Ejecuta el seed de categorías de ajuste.`,
    );
  }

  if (input.bankTransactionId) {
    const tx = await prisma.financeBankTransaction.findFirst({
      where: { id: input.bankTransactionId, tenantId, hiddenAt: null },
      select: { id: true },
    });
    if (!tx) throw new Error("Movimiento bancario no encontrado");

    const used = await prisma.financeCashflowOccurrence.findFirst({
      where: { tenantId, bankTransactionId: input.bankTransactionId },
      select: { id: true },
    });
    if (used) {
      throw new Error("Ese movimiento bancario ya está vinculado a otra ocurrencia");
    }
  }

  const absAmount = Math.abs(input.amountClp);
  const scheduledDate = new Date(
    input.effectiveDate.getUTCFullYear(),
    input.effectiveDate.getUTCMonth(),
    input.effectiveDate.getUTCDate(),
  );

  return prisma.$transaction(async (tx) => {
    const item = await tx.financeCashflowItem.create({
      data: {
        tenantId,
        categoryId: category.id,
        kind,
        source: "AJUSTE",
        name: `Ajuste de conciliación ${input.effectiveDate.toISOString().slice(0, 10)}`,
        description: input.notes.trim(),
        amount: new Decimal(absAmount),
        currency: "CLP",
        recurrence: "ONCE",
        startDate: scheduledDate,
        isActive: true,
        notes: input.notes.trim(),
        createdBy: userId ?? undefined,
      },
    });

    const occurrence = await tx.financeCashflowOccurrence.create({
      data: {
        tenantId,
        itemId: item.id,
        scheduledDate,
        effectiveDate: scheduledDate,
        amountClp: new Decimal(absAmount),
        status: "PAID",
        bankTransactionId: input.bankTransactionId ?? null,
        matchedAt: new Date(),
        matchedBy: userId ?? undefined,
        notes: input.notes.trim(),
      },
    });

    if (input.bankTransactionId) {
      await tx.financeBankTransaction.update({
        where: { id: input.bankTransactionId },
        data: { reconciliationStatus: "MATCHED" },
      });
    }

    return {
      itemId: item.id,
      occurrenceId: occurrence.id,
      categoryCode,
    };
  });
}

/** Lista los últimos ajustes del tenant — para auditoría / undo. */
export async function listAjustes(tenantId: string, limit = 50) {
  return prisma.financeCashflowItem.findMany({
    where: { tenantId, source: "AJUSTE", isActive: true },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      category: { select: { code: true, name: true } },
      occurrences: {
        select: {
          id: true,
          amountClp: true,
          scheduledDate: true,
          bankTransactionId: true,
        },
      },
    },
  });
}

/**
 * Cancela un ajuste: soft-delete (isActive=false) del item, status=CANCELLED
 * de la occurrence, y libera la bank tx vinculada. Reversible solo via DB.
 */
export async function cancelAjuste(
  tenantId: string,
  itemId: string,
  _userId: string | null,
): Promise<void> {
  const item = await prisma.financeCashflowItem.findFirst({
    where: { id: itemId, tenantId, source: "AJUSTE" },
    include: { occurrences: { select: { id: true, bankTransactionId: true } } },
  });
  if (!item) throw new Error("Ajuste no encontrado");

  await prisma.$transaction(async (tx) => {
    await tx.financeCashflowItem.update({
      where: { id: itemId },
      data: { isActive: false },
    });
    for (const occ of item.occurrences) {
      await tx.financeCashflowOccurrence.update({
        where: { id: occ.id },
        data: { status: "CANCELLED" },
      });
      if (occ.bankTransactionId) {
        await tx.financeBankTransaction.update({
          where: { id: occ.bankTransactionId },
          data: { reconciliationStatus: "UNMATCHED" },
        });
      }
    }
  });
}
