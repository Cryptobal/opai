import "server-only";
import { prisma } from "@/lib/prisma";
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
 */
export async function moveOccurrence(
  tenantId: string,
  id: string,
  newDate: Date,
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
  const collision = await prisma.financeCashflowOccurrence.findFirst({
    where: {
      tenantId,
      itemId: existing.itemId,
      scheduledDate: newDate,
    },
    select: { id: true },
  });
  if (collision && collision.id !== id) {
    throw new Error("Ya existe una ocurrencia de este ítem en esa fecha");
  }
  await prisma.financeCashflowOccurrence.update({
    where: { id },
    data: { scheduledDate: newDate, effectiveDate: newDate },
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
