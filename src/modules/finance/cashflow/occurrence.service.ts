import "server-only";
import { prisma } from "@/lib/prisma";
import { resolveUfForOccurrence } from "./uf-resolver";
import type {
  FinanceCashflowOccurrence,
  FinanceCashflowOccurrenceStatus,
  Prisma,
} from "@prisma/client";

export type CollisionResolveStrategy = "replace" | "next_free";

/** Razón por la que un move colisionó. */
export type CollisionReason =
  | "same_level"           // ambas occurrences son del mismo nivel (típico: dos proyecciones)
  | "target_is_stronger";  // la del destino es de mayor nivel (factura/conciliada), no se sobrescribe

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
    reason: CollisionReason;
  };
  constructor(conflict: OccurrenceCollisionError["conflict"]) {
    super(
      conflict.reason === "target_is_stronger"
        ? "No se puede mover encima de una occurrence con factura o conciliada"
        : "Ya existe otra cuota del mismo ítem en esa fecha",
    );
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
): Promise<ResolveCollisionResult> {
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

  // Validar que la semana destino no esté cerrada (isAnchor). Mover un
  // movimiento a una semana anclada invalidaría su conciliación bancaria.
  const targetDateOnly = new Date(
    Date.UTC(
      target.getUTCFullYear(),
      target.getUTCMonth(),
      target.getUTCDate(),
    ),
  );
  const weekClosed = await prisma.financeCashflowWeeklyClose.findFirst({
    where: {
      tenantId,
      isAnchor: true,
      weekStartDate: { lte: targetDateOnly },
      weekEndDate: { gte: targetDateOnly },
    },
    select: { id: true },
  });
  if (weekClosed) {
    throw new Error(
      "La semana destino está cerrada. Reabrila primero desde el flujo de caja para poder mover movimientos a esa fecha.",
    );
  }

  return resolveCollisionAndMove({
    tenantId,
    itemId: existing.itemId,
    occurrenceId: id,
    target,
    resolveStrategy: arg.resolveStrategy,
    direction: arg.daysFromCurrent && arg.daysFromCurrent < 0 ? -1 : 1,
  });
}

/** Helper: nivel de una occurrence DB. weak = sin DTE ni bank tx ni status fuerte. */
async function levelOfOccurrence(
  tx: Prisma.TransactionClient | typeof prisma,
  occurrenceId: string,
): Promise<"weak" | "strong"> {
  const o = await tx.financeCashflowOccurrence.findUnique({
    where: { id: occurrenceId },
    select: { dteId: true, bankTransactionId: true, status: true },
  });
  if (!o) return "weak";
  if (o.dteId != null) return "strong";
  if (o.bankTransactionId != null) return "strong";
  if (o.status === "PAID" || o.status === "CONFIRMED") return "strong";
  return "weak";
}

interface ResolveCollisionResult {
  overwrote?: { occurrenceId: string; itemName: string };
}

/**
 * Núcleo compartido por moveOccurrence y materializeAndAct: resuelve la
 * eventual colisión con [itemId, target] aplicando la política de jerarquía
 * (weak/strong) y, si corresponde, la strategy manual, y aplica el update en
 * la ocurrencia indicada.
 */
async function resolveCollisionAndMove(args: {
  tenantId: string;
  itemId: string;
  occurrenceId: string;
  target: Date;
  resolveStrategy?: CollisionResolveStrategy;
  direction: 1 | -1;
}): Promise<ResolveCollisionResult> {
  const { tenantId, itemId, occurrenceId, resolveStrategy, direction } = args;
  let target = args.target;
  const out: ResolveCollisionResult = {};

  const collision = await prisma.financeCashflowOccurrence.findFirst({
    where: { tenantId, itemId, scheduledDate: target },
    select: {
      id: true, status: true, dteId: true, bankTransactionId: true,
      isClosingAdjust: true,
      item: { select: { name: true } },
    },
  });

  if (collision && collision.id !== occurrenceId) {
    // CASO SOMBRA: la occurrence que movemos tiene DTE (factura real) y la del
    // destino es una proyección pura del MISMO item (sin DTE/banco/cierre). Es
    // la sombra que el motor ya oculta; al mover la factura encima, la
    // consolidamos (borramos la sombra) en vez de bloquear.
    const source = await prisma.financeCashflowOccurrence.findUnique({
      where: { id: occurrenceId },
      select: { dteId: true },
    });
    const sourceHasDte = source?.dteId != null;
    const targetIsPureProjection =
      collision.dteId == null &&
      collision.bankTransactionId == null &&
      !collision.isClosingAdjust &&
      collision.status !== "PAID" &&
      collision.status !== "CONFIRMED";
    if (sourceHasDte && targetIsPureProjection) {
      await prisma.financeCashflowOccurrence.delete({ where: { id: collision.id } });
      out.overwrote = {
        occurrenceId: collision.id,
        itemName: collision.item?.name ?? "proyección",
      };
      // cae al update final sin lanzar OccurrenceCollisionError
    } else {
    // Resolver según jerarquía: comparar nivel de source vs nivel del que está en destino
    const sourceLevel = await levelOfOccurrence(prisma, occurrenceId);
    const targetIsStrong =
      collision.dteId != null ||
      collision.bankTransactionId != null ||
      collision.status === "PAID" ||
      collision.status === "CONFIRMED";

    // Caso 1: source strong, target weak → sobrescribir automáticamente
    if (sourceLevel === "strong" && !targetIsStrong) {
      // Si la occurrence target es un ajuste de cierre, NO sobrescribir aunque sea weak
      const tgt = await prisma.financeCashflowOccurrence.findUnique({
        where: { id: collision.id },
        select: { isClosingAdjust: true },
      });
      if (tgt?.isClosingAdjust) {
        throw new OccurrenceCollisionError({
          existingOccurrenceId: collision.id,
          targetDate: target.toISOString().slice(0, 10),
          suggestedFreeDate: target.toISOString().slice(0, 10),
          reason: "target_is_stronger",
        });
      }
      await prisma.financeCashflowOccurrence.delete({ where: { id: collision.id } });
      out.overwrote = { occurrenceId: collision.id, itemName: collision.item?.name ?? "proyección" };
    }
    // Caso 2: source weak, target strong → bloqueo absoluto
    else if (sourceLevel === "weak" && targetIsStrong) {
      throw new OccurrenceCollisionError({
        existingOccurrenceId: collision.id,
        targetDate: target.toISOString().slice(0, 10),
        suggestedFreeDate: target.toISOString().slice(0, 10),
        reason: "target_is_stronger",
      });
    }
    // Caso 3: mismo nivel (ambos weak o ambos strong) → seguir flujo de resolveStrategy
    else {
      if (!resolveStrategy) {
        const probe = new Date(target);
        probe.setDate(probe.getDate() + direction);
        const suggested = await findFreeDate(tenantId, itemId, probe, occurrenceId, direction);
        throw new OccurrenceCollisionError({
          existingOccurrenceId: collision.id,
          targetDate: target.toISOString().slice(0, 10),
          suggestedFreeDate: suggested.toISOString().slice(0, 10),
          reason: "same_level",
        });
      }
      if (resolveStrategy === "replace") {
        if (collision.status === "PAID") {
          throw new Error("No se puede reemplazar una ocurrencia ya conciliada");
        }
        await prisma.financeCashflowOccurrence.delete({ where: { id: collision.id } });
        out.overwrote = { occurrenceId: collision.id, itemName: collision.item?.name ?? "proyección" };
      } else if (resolveStrategy === "next_free") {
        const probe = new Date(target);
        probe.setDate(probe.getDate() + direction);
        target = await findFreeDate(tenantId, itemId, probe, occurrenceId, direction);
      }
    }
    }
  }

  await prisma.financeCashflowOccurrence.update({
    where: { id: occurrenceId },
    data: { scheduledDate: target, effectiveDate: target },
  });

  return out;
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

/** Resuelve la categoría sistema por defecto del kind (ING_OTRO / EGR_OTRO),
 *  cayendo a la primera categoría activa del kind. Multi-tenant. */
async function resolveDefaultCategoryId(
  tenantId: string,
  kind: "INCOME" | "EXPENSE",
): Promise<string> {
  const defaultCode = kind === "INCOME" ? "ING_OTRO" : "EGR_OTRO";
  const preferred = await prisma.financeCashflowCategory.findFirst({
    where: { tenantId, code: defaultCode, kind, isActive: true },
    select: { id: true },
  });
  const fallback =
    preferred ??
    (await prisma.financeCashflowCategory.findFirst({
      where: { tenantId, kind, isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true },
    }));
  if (!fallback) {
    throw new Error(`No hay categoría ${kind} disponible para el tenant`);
  }
  return fallback.id;
}

/** Normaliza una fecha a medianoche UTC (las columnas del schema son @db.Date). */
function toUtcDate(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export interface CreateManualOccurrenceInput {
  kind: "INCOME" | "EXPENSE";
  name: string;
  amountClp: number;
  scheduledDate: Date;
  categoryId?: string | null;
  notes?: string | null;
}

/**
 * Quick-add: crea un FinanceCashflowItem MANUAL (recurrence=ONCE) + su
 * occurrence PROJECTED en la fecha indicada, en una sola transacción. Si no se
 * pasa categoryId, resuelve la categoría sistema por defecto del kind
 * (ING_OTRO / EGR_OTRO) y cae a la primera categoría activa del kind si esas
 * no existen. Multi-tenant: valida que la categoría pertenezca al tenant.
 */
export async function createManualOccurrence(
  tenantId: string,
  userId: string | null,
  input: CreateManualOccurrenceInput,
): Promise<FinanceCashflowOccurrence> {
  const name = input.name.trim();
  if (!name) throw new Error("El concepto es obligatorio");
  if (!Number.isFinite(input.amountClp) || input.amountClp <= 0) {
    throw new Error("El monto debe ser mayor a 0");
  }

  let categoryId = input.categoryId ?? null;
  if (categoryId) {
    const cat = await prisma.financeCashflowCategory.findFirst({
      where: { id: categoryId, tenantId, kind: input.kind, isActive: true },
      select: { id: true },
    });
    if (!cat) throw new Error("Categoría no encontrada para el tenant");
  } else {
    categoryId = await resolveDefaultCategoryId(tenantId, input.kind);
  }

  const scheduledDate = toUtcDate(input.scheduledDate);

  return prisma.$transaction(async (tx) => {
    const item = await tx.financeCashflowItem.create({
      data: {
        tenantId,
        categoryId: categoryId!,
        kind: input.kind,
        source: "MANUAL",
        name,
        amount: input.amountClp,
        currency: "CLP",
        recurrence: "ONCE",
        startDate: scheduledDate,
        isActive: true,
        createdBy: userId ?? undefined,
      },
    });
    return tx.financeCashflowOccurrence.create({
      data: {
        tenantId,
        itemId: item.id,
        scheduledDate,
        amountClp: input.amountClp,
        status: "PROJECTED",
        notes: input.notes?.trim() || null,
      },
    });
  });
}

/**
 * "+ Manual" desde el modal de cuadratura: registra un bank tx pendiente en el
 * flujo creando un item MANUAL (ONCE) + occurrence PAID conciliada en la fecha
 * del tx, y marca el tx como MATCHED. Sin formulario: kind/categoría/monto se
 * derivan del propio movimiento. Multi-tenant + idempotencia básica (rechaza
 * tx ya vinculado).
 */
export async function createManualOccurrenceFromBankTx(
  tenantId: string,
  userId: string | null,
  bankTransactionId: string,
  nameOverride?: string,
): Promise<FinanceCashflowOccurrence> {
  const tx = await prisma.financeBankTransaction.findFirst({
    where: { id: bankTransactionId, tenantId, hiddenAt: null },
    select: { id: true, amount: true, transactionDate: true, description: true },
  });
  if (!tx) throw new Error("Movimiento bancario no encontrado");

  const used = await prisma.financeCashflowOccurrence.findFirst({
    where: { tenantId, bankTransactionId },
    select: { id: true },
  });
  if (used) throw new Error("Ese movimiento ya está vinculado a otra ocurrencia");

  const amt = Number(tx.amount);
  const kind: "INCOME" | "EXPENSE" = amt >= 0 ? "INCOME" : "EXPENSE";
  const abs = Math.abs(amt);
  const categoryId = await resolveDefaultCategoryId(tenantId, kind);
  const scheduledDate = toUtcDate(tx.transactionDate);
  const name = (nameOverride ?? tx.description ?? "Movimiento manual").slice(0, 200);

  return prisma.$transaction(async (db) => {
    const item = await db.financeCashflowItem.create({
      data: {
        tenantId,
        categoryId,
        kind,
        source: "MANUAL",
        name,
        amount: abs,
        currency: "CLP",
        recurrence: "ONCE",
        startDate: scheduledDate,
        isActive: true,
        createdBy: userId ?? undefined,
      },
    });
    const occ = await db.financeCashflowOccurrence.create({
      data: {
        tenantId,
        itemId: item.id,
        scheduledDate,
        effectiveDate: scheduledDate,
        amountClp: abs,
        status: "PAID",
        bankTransactionId,
        matchedAt: new Date(),
        matchedBy: userId ?? undefined,
      },
    });
    await db.financeBankTransaction.update({
      where: { id: bankTransactionId },
      data: { reconciliationStatus: "MATCHED" },
    });
    return occ;
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
      /** DTE de la fila movida: vincula la cuota materializada para volverla
       *  "fuerte" (la factura manda sobre la sombra débil del destino). */
      dteId?: string;
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
): Promise<FinanceCashflowOccurrence & { overwrote?: { occurrenceId: string; itemName: string } }> {
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

  // Si la fila movida viene de un DTE, vinculamos la cuota materializada a él.
  // Esto la vuelve "fuerte" en resolveCollisionAndMove (caso sombra: la factura
  // manda sobre la proyección débil del destino) y hace que la celda muestre el
  // folio. Solo aplica a "move"; las demás acciones no traen dteId.
  const linkDteId = input.action === "move" ? input.dteId : undefined;
  const existing = await prisma.financeCashflowOccurrence.upsert({
    where: { itemId_scheduledDate: { itemId: item.id, scheduledDate: input.originalDate } },
    create: {
      tenantId,
      itemId: item.id,
      scheduledDate: input.originalDate,
      amountClp: amountClpBase,
      ufValueUsed: ufValue ?? undefined,
      status: "PROJECTED",
      ...(linkDteId ? { dteId: linkDteId } : {}),
    },
    update: linkDteId ? { dteId: linkDteId } : {},
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
    let moveResult: ResolveCollisionResult = {};
    if (!sameDay) {
      moveResult = await resolveCollisionAndMove({
        tenantId,
        itemId: item.id,
        occurrenceId: existing.id,
        target,
        resolveStrategy: input.resolveStrategy,
        direction: input.daysFromCurrent && input.daysFromCurrent < 0 ? -1 : 1,
      });
    }
    const moved = await prisma.financeCashflowOccurrence.findUniqueOrThrow({
      where: { id: existing.id },
    });
    return moveResult.overwrote ? { ...moved, overwrote: moveResult.overwrote } : moved;
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
