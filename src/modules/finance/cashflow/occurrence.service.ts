import "server-only";
import { prisma } from "@/lib/prisma";
import { resolveUfForOccurrence } from "./uf-resolver";
import type {
  FinanceCashflowOccurrence,
  FinanceCashflowOccurrenceStatus,
  Prisma,
} from "@prisma/client";

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
  arg: { newDate: Date | null; daysFromCurrent: number | null },
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

  const collision = await prisma.financeCashflowOccurrence.findFirst({
    where: {
      tenantId,
      itemId: existing.itemId,
      scheduledDate: target,
    },
    select: { id: true },
  });
  if (collision && collision.id !== id) {
    throw new Error("Ya existe una ocurrencia de este ítem en esa fecha");
  }
  await prisma.financeCashflowOccurrence.update({
    where: { id },
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
  | { itemId: string; originalDate: Date; action: "move"; newDate?: Date; daysFromCurrent?: number }
  | { itemId: string; originalDate: Date; action: "amount"; amountClp: number };

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
    if (
      target.toISOString().slice(0, 10) !==
      existing.scheduledDate.toISOString().slice(0, 10)
    ) {
      const collision = await prisma.financeCashflowOccurrence.findFirst({
        where: { tenantId, itemId: item.id, scheduledDate: target },
        select: { id: true },
      });
      if (collision && collision.id !== existing.id) {
        throw new Error("Ya existe una ocurrencia de este ítem en esa fecha");
      }
    }
    return prisma.financeCashflowOccurrence.update({
      where: { id: existing.id },
      data: { scheduledDate: target, effectiveDate: target },
    });
  }

  if (!Number.isFinite(input.amountClp) || input.amountClp <= 0) {
    throw new Error("El monto debe ser mayor a 0");
  }
  return prisma.financeCashflowOccurrence.update({
    where: { id: existing.id },
    data: { amountOverride: input.amountClp, amountClp: input.amountClp },
  });
}
