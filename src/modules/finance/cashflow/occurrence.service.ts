import "server-only";
import { prisma } from "@/lib/prisma";
import { resolveUfForOccurrence } from "./uf-resolver";
import type {
  FinanceCashflowOccurrence,
  FinanceCashflowOccurrenceStatus,
  Prisma,
} from "@prisma/client";

export type CollisionResolveStrategy = "replace" | "next_free";

/**
 * Lanzado cuando una operación de mover ocurrencia choca con otra existente
 * y el caller no especificó cómo resolverla. La API la convierte en una
 * respuesta 409 con la metadata, que la UI usa para abrir el modal con
 * [Reemplazar] [Mover a fecha libre] [Cancelar].
 */
export class OccurrenceCollisionError extends Error {
  conflict: {
    existingOccurrenceId: string;
    targetDate: string;
    suggestedFreeDate: string;
  };
  constructor(conflict: OccurrenceCollisionError["conflict"]) {
    super("Ya existe una ocurrencia de este ítem en esa fecha");
    this.name = "OccurrenceCollisionError";
    this.conflict = conflict;
  }
}

const MAX_FREE_DATE_PROBES = 365;

/**
 * Busca la siguiente fecha libre (sin colisión) para un item, partiendo de
 * `startFrom` y avanzando 1 día por iteración. Si `startFrom` ya está libre,
 * la devuelve. Direction: 1 = futuro, -1 = pasado. Lanza si no encuentra una
 * fecha libre dentro de MAX_FREE_DATE_PROBES días.
 */
async function findFreeDate(
  tenantId: string,
  itemId: string,
  startFrom: Date,
  excludeOccurrenceId: string | null,
  direction: 1 | -1 = 1,
): Promise<Date> {
  const probe = new Date(startFrom);
  for (let i = 0; i < MAX_FREE_DATE_PROBES; i++) {
    const collision = await prisma.financeCashflowOccurrence.findFirst({
      where: { tenantId, itemId, scheduledDate: probe },
      select: { id: true },
    });
    if (!collision || collision.id === excludeOccurrenceId) return new Date(probe);
    probe.setDate(probe.getDate() + direction);
  }
  throw new Error("No se encontró una fecha libre cercana");
}

export async function listMaterializedOccurrences(
  tenantId: string,
  from: Date,
  to: Date,
  itemIds?: string[],
): Promise<FinanceCashflowOccurrence[]> {
  return prisma.financeCashflowOccurrence.findMany({
    where: {
      tenantId,
      scheduledDate: { gte: from, lte: to },
      ...(itemIds?.length && { itemId: { in: itemIds } }),
    },
  });
}

export async function upsertOccurrence(
  tenantId: string,
  itemId: string,
  scheduledDate: Date,
  patch: {
    effectiveDate?: Date | null;
    amountOverride?: number | null;
    ufValueUsed?: number | null;
    amountClp: number;
    status?: FinanceCashflowOccurrenceStatus;
    bankTransactionId?: string | null;
    notes?: string | null;
    matchedBy?: string | null;
  },
): Promise<FinanceCashflowOccurrence> {
  const matchedAt = patch.bankTransactionId ? new Date() : undefined;
  const data: Prisma.FinanceCashflowOccurrenceUncheckedCreateInput = {
    tenantId,
    itemId,
    scheduledDate,
    amountClp: patch.amountClp,
    status: patch.status ?? "PROJECTED",
  };
  if (patch.effectiveDate !== undefined) data.effectiveDate = patch.effectiveDate;
  if (patch.amountOverride !== undefined) data.amountOverride = patch.amountOverride;
  if (patch.ufValueUsed !== undefined) data.ufValueUsed = patch.ufValueUsed;
  if (patch.bankTransactionId !== undefined) data.bankTransactionId = patch.bankTransactionId;
  if (patch.notes !== undefined) data.notes = patch.notes;
  if (patch.matchedBy !== undefined) data.matchedBy = patch.matchedBy;
  if (matchedAt) data.matchedAt = matchedAt;

  return prisma.financeCashflowOccurrence.upsert({
    where: { itemId_scheduledDate: { itemId, scheduledDate } },
    update: {
      amountClp: patch.amountClp,
      ...(patch.effectiveDate !== undefined && { effectiveDate: patch.effectiveDate }),
      ...(patch.amountOverride !== undefined && { amountOverride: patch.amountOverride }),
      ...(patch.ufValueUsed !== undefined && { ufValueUsed: patch.ufValueUsed }),
      ...(patch.status && { status: patch.status }),
      ...(patch.bankTransactionId !== undefined && { bankTransactionId: patch.bankTransactionId }),
      ...(patch.notes !== undefined && { notes: patch.notes }),
      ...(patch.matchedBy !== undefined && { matchedBy: patch.matchedBy }),
      ...(matchedAt && { matchedAt }),
    },
    create: data,
  });
}

export async function changeOccurrenceStatus(
  tenantId: string,
  id: string,
  status: FinanceCashflowOccurrenceStatus,
  effectiveDate?: Date,
): Promise<FinanceCashflowOccurrence> {
  const existing = await prisma.financeCashflowOccurrence.findFirst({ where: { id, tenantId } });
  if (!existing) throw new Error("Ocurrencia no encontrada");
  return prisma.financeCashflowOccurrence.update({
    where: { id },
    data: {
      status,
      ...(effectiveDate && { effectiveDate }),
    },
  });
}

export async function unmatchOccurrence(
  tenantId: string,
  id: string,
): Promise<FinanceCashflowOccurrence> {
  const existing = await prisma.financeCashflowOccurrence.findFirst({ where: { id, tenantId } });
  if (!existing) throw new Error("Ocurrencia no encontrada");
  return prisma.financeCashflowOccurrence.update({
    where: { id },
    data: { bankTransactionId: null, matchedAt: null, matchedBy: null, status: "PROJECTED" },
  });
}

export async function linkOccurrenceToBankTx(
  tenantId: string,
  id: string,
  bankTransactionId: string,
  matchedBy: string | null,
): Promise<FinanceCashflowOccurrence> {
  const existing = await prisma.financeCashflowOccurrence.findFirst({ where: { id, tenantId } });
  if (!existing) throw new Error("Ocurrencia no encontrada");
  return prisma.financeCashflowOccurrence.update({
    where: { id },
    data: {
      bankTransactionId,
      matchedAt: new Date(),
      matchedBy: matchedBy ?? undefined,
      status: "PAID",
    },
  });
}

/**
 * Reagenda una ocurrencia materializada a una nueva fecha.
 *
 * Reglas:
 *  - La ocurrencia debe pertenecer al tenant.
 *  - No se pueden mover ocurrencias ya pagadas/conciliadas (status=PAID).
 *  - No puede chocar con otra ocurrencia del mismo item en la fecha destino
 *    (la unique [itemId, scheduledDate] del schema lo impediría igual; acá
 *    devolvemos un error claro antes de invocar a Prisma).
 *
 * Actualiza tanto `scheduledDate` como `effectiveDate` para mantener
 * consistencia con el flujo de matching.
 *
 * Acepta dos modos de especificar la fecha destino:
 *  - newDate: fecha absoluta
 *  - daysFromCurrent: offset relativo (en días) desde la fecha actual de la ocurrencia
 */
export async function moveOccurrence(
  tenantId: string,
  id: string,
  arg: {
    newDate: Date | null;
    daysFromCurrent: number | null;
    resolveStrategy?: CollisionResolveStrategy;
  },
): Promise<void> {
  const existing = await prisma.financeCashflowOccurrence.findFirst({
    where: { id, tenantId },
    select: { id: true, itemId: true, scheduledDate: true, status: true },
  });
  if (!existing) {
    throw new Error("Ocurrencia no encontrada");
  }
  if (existing.status === "PAID") {
    throw new Error("No se puede mover una ocurrencia ya pagada/conciliada");
  }

  let target: Date;
  if (arg.newDate) {
    target = arg.newDate;
  } else if (arg.daysFromCurrent !== null) {
    target = new Date(existing.scheduledDate);
    target.setDate(target.getDate() + arg.daysFromCurrent);
  } else {
    throw new Error("Se requiere newDate o daysFromCurrent");
  }

  await resolveCollisionAndMove({
    tenantId,
    itemId: existing.itemId,
    occurrenceId: id,
    target,
    resolveStrategy: arg.resolveStrategy,
    direction: arg.daysFromCurrent && arg.daysFromCurrent < 0 ? -1 : 1,
  });
}

/**
 * Núcleo compartido por moveOccurrence y materializeAndAct: resuelve la
 * eventual colisión con [itemId, target] según strategy y aplica el update
 * en la ocurrencia indicada.
 */
async function resolveCollisionAndMove(args: {
  tenantId: string;
  itemId: string;
  occurrenceId: string;
  target: Date;
  resolveStrategy?: CollisionResolveStrategy;
  direction: 1 | -1;
}): Promise<void> {
  const { tenantId, itemId, occurrenceId, resolveStrategy, direction } = args;
  let target = args.target;

  const collision = await prisma.financeCashflowOccurrence.findFirst({
    where: { tenantId, itemId, scheduledDate: target },
    select: { id: true, status: true },
  });

  if (collision && collision.id !== occurrenceId) {
    if (!resolveStrategy) {
      // Calcular sugerencia de próxima fecha libre para la UI.
      const probe = new Date(target);
      probe.setDate(probe.getDate() + direction);
      const suggested = await findFreeDate(tenantId, itemId, probe, occurrenceId, direction);
      throw new OccurrenceCollisionError({
        existingOccurrenceId: collision.id,
        targetDate: target.toISOString().slice(0, 10),
        suggestedFreeDate: suggested.toISOString().slice(0, 10),
      });
    }
    if (resolveStrategy === "replace") {
      if (collision.status === "PAID") {
        throw new Error("No se puede reemplazar una ocurrencia ya conciliada");
      }
      await prisma.financeCashflowOccurrence.delete({ where: { id: collision.id } });
    } else if (resolveStrategy === "next_free") {
      const probe = new Date(target);
      probe.setDate(probe.getDate() + direction);
      target = await findFreeDate(tenantId, itemId, probe, occurrenceId, direction);
    }
  }

  await prisma.financeCashflowOccurrence.update({
    where: { id: occurrenceId },
    data: { scheduledDate: target, effectiveDate: target },
  });
}

/**
 * Override manual del monto de una ocurrencia materializada. Persiste
 * `amountOverride` y actualiza `amountClp` para reflejar el monto que el
 * usuario quiere ver. Para items en UF, el caller debe haber recomputado
 * el amountClp con el factor de UF guardado antes de invocar.
 */
export async function setOccurrenceAmountOverride(
  tenantId: string,
  id: string,
  newAmountClp: number,
): Promise<void> {
  if (!Number.isFinite(newAmountClp) || newAmountClp <= 0) {
    throw new Error("El monto debe ser mayor a 0");
  }
  const existing = await prisma.financeCashflowOccurrence.findFirst({
    where: { id, tenantId },
    select: { id: true, status: true, ufValueUsed: true },
  });
  if (!existing) throw new Error("Ocurrencia no encontrada");
  if (existing.status === "PAID") {
    throw new Error("No se puede editar el monto de una ocurrencia ya conciliada");
  }
  await prisma.financeCashflowOccurrence.update({
    where: { id },
    data: {
      amountOverride: newAmountClp,
      amountClp: newAmountClp,
    },
  });
}

export type MaterializeAndActInput =
  | {
      itemId: string;
      originalDate: Date;
      action: "move";
      newDate?: Date;
      daysFromCurrent?: number;
      resolveStrategy?: CollisionResolveStrategy;
    }
  | { itemId: string; originalDate: Date; action: "amount"; amountClp: number }
  | { itemId: string; originalDate: Date; action: "cancel" };

/**
 * Materializa una ocurrencia virtual (idempotente) y aplica una acción sobre
 * ella en una sola llamada. La unique [itemId, scheduledDate] del schema
 * garantiza que un segundo llamado con la misma originalDate reutilice la fila
 * existente, preservando overrides previos del usuario.
 */
export async function materializeAndAct(
  tenantId: string,
  input: MaterializeAndActInput,
): Promise<FinanceCashflowOccurrence> {
  const item = await prisma.financeCashflowItem.findFirst({
    where: { id: input.itemId, tenantId, isActive: true },
    select: {
      id: true,
      amount: true,
      currency: true,
      ufFixingPolicy: true,
      ufFixingDay: true,
    },
  });
  if (!item) throw new Error("Item no encontrado o inactivo");

  const itemAmount = Number(item.amount);
  let amountClpBase: number;
  let ufValue: number | null = null;
  if (item.currency === "UF") {
    ufValue = await resolveUfForOccurrence(
      item.ufFixingPolicy,
      item.ufFixingDay,
      input.originalDate,
    );
    amountClpBase = itemAmount * ufValue;
  } else {
    amountClpBase = itemAmount;
  }

  const existing = await prisma.financeCashflowOccurrence.upsert({
    where: { itemId_scheduledDate: { itemId: item.id, scheduledDate: input.originalDate } },
    create: {
      tenantId,
      itemId: item.id,
      scheduledDate: input.originalDate,
      amountClp: amountClpBase,
      ufValueUsed: ufValue ?? undefined,
      status: "PROJECTED",
    },
    update: {},
  });

  if (existing.status === "PAID") {
    if (input.action === "move") {
      throw new Error("No se puede mover una ocurrencia ya pagada/conciliada");
    }
    if (input.action === "amount") {
      throw new Error("No se puede editar el monto de una ocurrencia ya conciliada");
    }
    if (input.action === "cancel") {
      throw new Error("No se puede cancelar una ocurrencia ya pagada/conciliada");
    }
  }

  if (input.action === "cancel") {
    return prisma.financeCashflowOccurrence.update({
      where: { id: existing.id },
      data: { status: "CANCELLED" },
    });
  }

  if (input.action === "move") {
    let target: Date;
    if (input.newDate) {
      target = input.newDate;
    } else if (input.daysFromCurrent !== undefined) {
      target = new Date(existing.scheduledDate);
      target.setDate(target.getDate() + input.daysFromCurrent);
    } else {
      throw new Error("Se requiere newDate o daysFromCurrent para move");
    }
    const sameDay =
      target.toISOString().slice(0, 10) ===
      existing.scheduledDate.toISOString().slice(0, 10);
    if (!sameDay) {
      await resolveCollisionAndMove({
        tenantId,
        itemId: item.id,
        occurrenceId: existing.id,
        target,
        resolveStrategy: input.resolveStrategy,
        direction: input.daysFromCurrent && input.daysFromCurrent < 0 ? -1 : 1,
      });
    }
    return prisma.financeCashflowOccurrence.findUniqueOrThrow({
      where: { id: existing.id },
    });
  }

  // input.action === "amount" (única alternativa restante por el discriminated union)
  if (input.action !== "amount") {
    throw new Error("Acción no soportada");
  }
  if (!Number.isFinite(input.amountClp) || input.amountClp <= 0) {
    throw new Error("El monto debe ser mayor a 0");
  }
  return prisma.financeCashflowOccurrence.update({
    where: { id: existing.id },
    data: { amountOverride: input.amountClp, amountClp: input.amountClp },
  });
}

export interface ConfirmCashflowMatchInput {
  occurrenceId: string;
  bankTransactionId: string;
  /** Si true, mueve scheduledDate y effectiveDate a transactionDate del banco. */
  rebalanceDate?: boolean;
  /** Si true, ajusta amountClp al monto real del banco (registra varianza). */
  rebalanceAmount?: boolean;
}

/**
 * Operación atómica de confirmación de match cashflow ↔ bank tx.
 *
 * Realiza en una sola transacción:
 *  1. Marca la occurrence como PAID
 *  2. Vincula con bankTransactionId
 *  3. Si rebalanceDate=true: scheduledDate y effectiveDate ← bank tx date
 *  4. Si rebalanceAmount=true: amountClp ← monto banco (absoluto)
 *  5. Marca el bank tx con reconciliationStatus=MATCHED
 *
 * No modifica el item maestro — solo la occurrence individual.
 * Idempotente: si la occurrence ya está PAID con ese mismo bank tx, no-op.
 */
export async function confirmCashflowMatch(
  tenantId: string,
  userId: string | null,
  input: ConfirmCashflowMatchInput,
): Promise<FinanceCashflowOccurrence> {
  const { occurrenceId, bankTransactionId, rebalanceDate = true, rebalanceAmount = true } = input;

  return prisma.$transaction(async (tx) => {
    const occ = await tx.financeCashflowOccurrence.findFirst({
      where: { id: occurrenceId, tenantId },
      select: { id: true, itemId: true, scheduledDate: true, status: true, bankTransactionId: true },
    });
    if (!occ) throw new Error("Occurrence no encontrada");
    if (occ.status === "PAID" && occ.bankTransactionId === bankTransactionId) {
      const same = await tx.financeCashflowOccurrence.findUnique({ where: { id: occurrenceId } });
      if (!same) throw new Error("Occurrence desapareció");
      return same;
    }

    const bankTx = await tx.financeBankTransaction.findFirst({
      where: { id: bankTransactionId, tenantId, hiddenAt: null },
      select: { id: true, transactionDate: true, amount: true },
    });
    if (!bankTx) throw new Error("Movimiento bancario no encontrado");

    const bankAmountAbs = Math.abs(Number(bankTx.amount));

    // Si rebalanceDate, validar que no choque con otra occurrence del mismo item
    if (rebalanceDate) {
      const collision = await tx.financeCashflowOccurrence.findFirst({
        where: {
          tenantId,
          itemId: occ.itemId,
          scheduledDate: bankTx.transactionDate,
          id: { not: occurrenceId },
        },
        select: { id: true },
      });
      if (collision) {
        throw new Error(
          `Ya existe otra ocurrencia del mismo item en ${bankTx.transactionDate.toISOString().slice(0, 10)}. Resolvé manualmente.`,
        );
      }
    }

    const updateData: Record<string, unknown> = {
      status: "PAID",
      bankTransactionId,
      matchedAt: new Date(),
      matchedBy: userId ?? undefined,
    };
    if (rebalanceDate) {
      updateData.scheduledDate = bankTx.transactionDate;
      updateData.effectiveDate = bankTx.transactionDate;
    } else {
      updateData.effectiveDate = bankTx.transactionDate;
    }
    if (rebalanceAmount) {
      updateData.amountOverride = bankAmountAbs;
      updateData.amountClp = bankAmountAbs;
    }

    const updated = await tx.financeCashflowOccurrence.update({
      where: { id: occurrenceId },
      data: updateData,
    });

    await tx.financeBankTransaction.update({
      where: { id: bankTransactionId },
      data: { reconciliationStatus: "MATCHED" },
    });

    return updated;
  });
}
