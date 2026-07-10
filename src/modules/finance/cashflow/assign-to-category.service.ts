import "server-only";
import type { FinanceCashflowRecurrence } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";
import { getOrCreateCashflowConfig } from "./config.service";
import {
  weekStartForClosing,
  weekEndForClosing,
  utcCalendarDay,
} from "./recurrence-engine";
import { resolveConsumableProjection } from "./assign-projection-resolver";

/**
 * Motor ÚNICO para asignar un movimiento bancario a una categoría de flujo
 * de caja. Lo usan el endpoint `from-bank-tx`, el modal de Slack y la
 * asignación masiva de Opai. Toda la lógica de "el real CONSUME el
 * proyectado" (Opción A) vive acá — cero duplicación.
 *
 * Regla de negocio (no negociable): si la categoría ya tiene una cuota
 * PROYECTADA en la semana del movimiento, el real la CONSUME (la reemplaza)
 * en vez de sumarse. Ej: 5M proyectados + 4M reales → la celda muestra 4M,
 * NO 9M. La diferencia (−1M) es la varianza.
 *
 * Nota sobre representación: la proyección lee `amountClp` como monto mostrado
 * de una occurrence PAID directamente conciliada (los campos in-memory
 * `actualAmountClp`/`varianceClp` sólo los pueblan los matchers de bank-link y
 * DTE, que no tocan una asignación directa a categoría; NO existen como
 * columnas). Por eso el REAL va en `amountClp` y el PROYECTADO original queda
 * en `amountOverride` (lo que además evita re-aplicar IVA sobre un monto
 * bancario que ya es bruto, y permite revertir sin perder dato ni migrar).
 */

export interface AssignToCategoryInput {
  bankTransactionId: string;
  categoryId: string;
  name?: string;
  installationId?: string | null;
  notes?: string | null;
  /** Sólo aplica a la rama "real puro" (crea item). Default ONCE. */
  recurrence?: FinanceCashflowRecurrence;
  /** Override de monto; si no viene se usa el valor absoluto del tx. */
  amountClp?: number;
}

export interface AssignToCategoryResult {
  mode: "consumed" | "created";
  occurrenceId: string;
  itemId: string;
  /** real − proyectado (sólo en `consumed`). */
  varianceClp?: number;
  realClp: number;
  projectedClp?: number;
}

export class AssignToCategoryError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "AssignToCategoryError";
  }
}

export async function assignBankTxToCategory(
  tenantId: string,
  userId: string | null,
  input: AssignToCategoryInput,
): Promise<AssignToCategoryResult> {
  const tx = await prisma.financeBankTransaction.findFirst({
    where: { id: input.bankTransactionId, tenantId, hiddenAt: null },
    select: { id: true, amount: true, transactionDate: true, description: true },
  });
  if (!tx) throw new AssignToCategoryError("Movimiento bancario no encontrado", 404);

  const alreadyLinked = await prisma.financeCashflowOccurrence.findFirst({
    where: { tenantId, bankTransactionId: tx.id },
    select: { id: true },
  });
  if (alreadyLinked) {
    throw new AssignToCategoryError(
      "Ese movimiento bancario ya está vinculado a otra ocurrencia",
      409,
    );
  }

  const category = await prisma.financeCashflowCategory.findFirst({
    where: { id: input.categoryId, tenantId, isActive: true },
    select: { id: true, kind: true, isTaxExempt: true },
  });
  if (!category) throw new AssignToCategoryError("Categoría no encontrada", 404);

  const config = await getOrCreateCashflowConfig(tenantId);
  const closingDow = config.weekClosingDow ?? 5;

  const absAmount = Math.abs(input.amountClp ?? Number(tx.amount));
  const txDate = utcCalendarDay(tx.transactionDate);
  const weekStart = weekStartForClosing(txDate, closingDow);
  const weekEnd = weekEndForClosing(txDate, closingDow);

  const projected = await resolveConsumableProjection(prisma, {
    tenantId,
    categoryId: category.id,
    isTaxExempt: category.isTaxExempt,
    weekStart,
    weekEnd,
    txDate,
  });

  return prisma.$transaction(async (db) => {
    if (projected) {
      // ── Rama A: CONSUME el proyectado (no suma). ──
      const proj = projected.projectedGrossClp;
      const occData = {
        status: "PAID" as const,
        amountClp: new Decimal(absAmount),
        amountOverride: new Decimal(proj),
        bankTransactionId: tx.id,
        effectiveDate: txDate,
        matchedAt: new Date(),
        matchedBy: userId ?? undefined,
        notes: `Real asignado al flujo — consumió proyección de la semana (real ${absAmount}, proyectado ${proj})`,
      };
      const occurrence =
        projected.kind === "materialized"
          ? await db.financeCashflowOccurrence.update({
              where: { id: projected.occurrenceId },
              data: occData,
            })
          : await db.financeCashflowOccurrence.create({
              data: {
                tenantId,
                itemId: projected.itemId,
                scheduledDate: projected.scheduledDate,
                ...occData,
              },
            });
      await db.financeBankTransaction.update({
        where: { id: tx.id },
        data: { reconciliationStatus: "MATCHED" },
      });
      return {
        mode: "consumed",
        occurrenceId: occurrence.id,
        itemId: projected.itemId,
        varianceClp: absAmount - proj,
        realClp: absAmount,
        projectedClp: proj,
      };
    }

    // ── Rama B: real puro (no había nada que consumir). Crea item + occ. ──
    const item = await db.financeCashflowItem.create({
      data: {
        tenantId,
        categoryId: category.id,
        kind: category.kind,
        source: "MANUAL",
        name: input.name?.trim() || tx.description || "Movimiento bancario",
        amount: new Decimal(absAmount),
        currency: "CLP",
        recurrence: input.recurrence ?? "ONCE",
        startDate: txDate,
        isActive: true,
        installationId: input.installationId ?? null,
        notes: input.notes ?? null,
        createdBy: userId ?? undefined,
      },
    });
    const occurrence = await db.financeCashflowOccurrence.create({
      data: {
        tenantId,
        itemId: item.id,
        scheduledDate: txDate,
        effectiveDate: txDate,
        amountClp: new Decimal(absAmount),
        // amountOverride = real evita que la proyección re-aplique IVA sobre
        // un monto bancario que ya es bruto/final.
        amountOverride: new Decimal(absAmount),
        status: "PAID",
        bankTransactionId: tx.id,
        matchedAt: new Date(),
        matchedBy: userId ?? undefined,
        notes: `Creada desde mov banco no clasificado: ${tx.description ?? ""}`,
      },
    });
    await db.financeBankTransaction.update({
      where: { id: tx.id },
      data: { reconciliationStatus: "MATCHED" },
    });
    return {
      mode: "created",
      occurrenceId: occurrence.id,
      itemId: item.id,
      realClp: absAmount,
    };
  });
}

/**
 * Undo de una asignación. Detecta el modo por la forma del item:
 *  - "created" (rama B): item MANUAL/ONCE creado con esta única cuota →
 *    borra occurrence + item y revierte el tx a UNMATCHED.
 *  - "consumed" (rama A): devuelve la cuota a PROJECTED con su monto
 *    proyectado (guardado en amountOverride) y el tx a UNMATCHED. La cuota
 *    materializada queda idéntica en valor a la proyección original.
 */
export async function revertBankTxCategoryAssignment(
  tenantId: string,
  _userId: string | null,
  bankTransactionId: string,
): Promise<{ mode: "consumed" | "created" }> {
  return prisma.$transaction(async (db) => {
    const occ = await db.financeCashflowOccurrence.findFirst({
      where: { tenantId, bankTransactionId },
      select: {
        id: true,
        itemId: true,
        amountOverride: true,
        item: {
          select: {
            id: true,
            source: true,
            recurrence: true,
            _count: { select: { occurrences: true } },
          },
        },
      },
    });
    if (!occ) {
      throw new AssignToCategoryError("No hay asignación que revertir", 404);
    }

    const isCreated =
      occ.item.source === "MANUAL" &&
      occ.item.recurrence === "ONCE" &&
      occ.item._count.occurrences === 1;

    if (isCreated) {
      await db.financeCashflowOccurrence.delete({ where: { id: occ.id } });
      await db.financeCashflowItem.delete({ where: { id: occ.itemId } });
    } else {
      // Consumido: restaurar a PROJECTED con el monto proyectado original.
      // Se conserva amountOverride para que la proyección NO re-aplique IVA
      // sobre un valor que ya es bruto.
      const proj = occ.amountOverride;
      await db.financeCashflowOccurrence.update({
        where: { id: occ.id },
        data: {
          status: "PROJECTED",
          bankTransactionId: null,
          effectiveDate: null,
          matchedAt: null,
          matchedBy: null,
          ...(proj != null ? { amountClp: proj } : {}),
          notes: null,
        },
      });
    }

    await db.financeBankTransaction.update({
      where: { id: bankTransactionId },
      data: { reconciliationStatus: "UNMATCHED" },
    });

    return { mode: isCreated ? "created" : "consumed" };
  });
}
