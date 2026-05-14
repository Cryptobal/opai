/**
 * IPC adjustment service (Fase E — cierre).
 *
 * Funciones:
 *   - `computeUpcomingDueDates(item, horizonDays)` — devuelve las fechas de
 *     ajuste en la ventana, según `hasIpcAdjustment` + `ipcAdjustmentMonths`.
 *   - `createPendingForItem(...)` — crea registros PENDING para fechas
 *     próximas si no existen ya.
 *   - `applyAdjustment(tenantId, id, pct, ctx)` — aplica el % al item:
 *     recalcula amount, snapshot old/new, marca APPLIED y limpia
 *     ocurrencias proyectadas futuras desde dueDate.
 */

import "server-only";
import { prisma } from "@/lib/prisma";

export interface IpcEligibleItem {
  id: string;
  tenantId: string;
  startDate: Date;
  endDate: Date | null;
  ipcAdjustmentMonths: number | null;
}

/**
 * Suma N meses a una fecha, preservando el día del mes (con clamp al
 * último día si el destino no lo tiene). No usa date-fns para mantener
 * la dependencia mínima en el cron.
 */
function addMonthsUtc(d: Date, n: number): Date {
  const out = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1),
  );
  // Clamp al último día del mes destino para evitar saltos (ej. enero 31 → marzo 3).
  const lastDay = new Date(
    Date.UTC(out.getUTCFullYear(), out.getUTCMonth() + 1, 0),
  ).getUTCDate();
  out.setUTCDate(Math.min(d.getUTCDate(), lastDay));
  return out;
}

/**
 * Devuelve todas las fechas de ajuste que caen dentro del horizonte
 * (típicamente 30 días desde hoy) y que aún no tienen registro creado.
 * Considera `endDate` del item para no proyectar fuera de vigencia.
 */
export function computeUpcomingDueDates(
  item: IpcEligibleItem,
  horizonDays = 30,
  now: Date = new Date(),
): Date[] {
  const months = item.ipcAdjustmentMonths;
  if (!months || months <= 0) return [];
  const horizon = new Date(now);
  horizon.setUTCDate(horizon.getUTCDate() + horizonDays);
  const result: Date[] = [];
  // Generamos hasta 10 fechas adelante; con horizonte 30 días, normalmente
  // sólo cae 1 o ninguna. El cap es para evitar loops infinitos si el item
  // tiene endDate muy lejano y frecuencia mensual.
  for (let i = 1; i <= 36; i += 1) {
    const due = addMonthsUtc(item.startDate, months * i);
    if (item.endDate && due > item.endDate) break;
    if (due > horizon) break;
    if (due <= now) continue;
    result.push(due);
  }
  return result;
}

/**
 * Asegura que existan registros PENDING para todas las fechas próximas
 * del item. Devuelve los registros creados (no los existentes).
 */
export async function ensurePendingForItem(
  item: IpcEligibleItem,
  horizonDays = 30,
): Promise<Array<{ id: string; dueDate: Date }>> {
  const dues = computeUpcomingDueDates(item, horizonDays);
  if (dues.length === 0) return [];
  const existing = await prisma.financeContractIpcAdjustment.findMany({
    where: {
      itemId: item.id,
      dueDate: { in: dues },
    },
    select: { dueDate: true },
  });
  const existingSet = new Set(
    existing.map((r) => r.dueDate.toISOString().slice(0, 10)),
  );
  const toCreate = dues.filter(
    (d) => !existingSet.has(d.toISOString().slice(0, 10)),
  );
  if (toCreate.length === 0) return [];
  const created: Array<{ id: string; dueDate: Date }> = [];
  for (const d of toCreate) {
    const row = await prisma.financeContractIpcAdjustment.create({
      data: {
        tenantId: item.tenantId,
        itemId: item.id,
        dueDate: d,
        status: "PENDING",
      },
      select: { id: true, dueDate: true },
    });
    created.push(row);
  }
  return created;
}

export interface ApplyAdjustmentInput {
  /** Porcentaje del ajuste (ej. 3.5 para 3,5%). */
  pct: number;
  notes?: string;
  /**
   * Fecha desde la cual el reajuste empieza a aplicar (solo manual). Si
   * se omite, se usa hoy. Las ocurrencias PROYECTADAS con scheduledDate
   * >= dueDate se regeneran al nuevo monto; las anteriores quedan al
   * monto previo. El próximo ciclo se programa a `dueDate + N meses`.
   */
  dueDate?: Date;
}

/**
 * Aplica el ajuste IPC: actualiza `item.amount`, deja snapshot old/new,
 * marca el adjustment como APPLIED, y borra ocurrencias proyectadas
 * desde la fecha en adelante para que se regeneren con el nuevo monto.
 *
 * Tras aplicar, recalcula el próximo ciclo: borra los PENDING futuros
 * del item y crea uno nuevo con `dueDate = appliedAt + ipcAdjustmentMonths`
 * (no desde startDate del contrato). El próximo reajuste cae N meses
 * después del momento del reajuste real, no del calendario teórico.
 */
export async function applyAdjustment(
  tenantId: string,
  adjustmentId: string,
  input: ApplyAdjustmentInput,
  ctx: { userId: string },
): Promise<{ newAmount: number; oldAmount: number; nextDueDate: Date | null }> {
  if (!Number.isFinite(input.pct) || input.pct <= -100) {
    throw new Error("Porcentaje inválido");
  }
  return prisma.$transaction(async (tx) => {
    const adj = await tx.financeContractIpcAdjustment.findFirst({
      where: { id: adjustmentId, tenantId },
      include: {
        item: {
          select: {
            id: true,
            amount: true,
            isActive: true,
            endDate: true,
            hasIpcAdjustment: true,
            ipcAdjustmentMonths: true,
          },
        },
      },
    });
    if (!adj) throw new Error("Ajuste IPC no encontrado");
    if (adj.status !== "PENDING") {
      throw new Error(`El ajuste ya fue ${adj.status.toLowerCase()}`);
    }
    if (!adj.item || !adj.item.isActive) {
      throw new Error("El item de flujo asociado no está activo");
    }
    const oldAmount = Number(adj.item.amount);
    const newAmount = Math.round(oldAmount * (1 + input.pct / 100) * 100) / 100;
    const now = new Date();

    await tx.financeCashflowItem.update({
      where: { id: adj.item.id },
      data: { amount: newAmount },
    });

    await tx.financeContractIpcAdjustment.update({
      where: { id: adjustmentId },
      data: {
        status: "APPLIED",
        appliedPct: input.pct,
        oldAmount,
        newAmount,
        appliedAt: now,
        appliedBy: ctx.userId,
        notes: input.notes ?? null,
      },
    });

    // Limpiar ocurrencias PROYECTADAS desde dueDate (inclusive) para que
    // se regeneren con el nuevo monto. Las PAID/CONFIRMED/CANCELLED se
    // respetan: el ajuste sólo afecta el futuro.
    await tx.financeCashflowOccurrence.deleteMany({
      where: {
        tenantId,
        itemId: adj.item.id,
        scheduledDate: { gte: adj.dueDate },
        status: "PROJECTED",
      },
    });

    const nextDueDate = await rescheduleNextPending(tx, {
      tenantId,
      itemId: adj.item.id,
      hasIpcAdjustment: adj.item.hasIpcAdjustment,
      ipcAdjustmentMonths: adj.item.ipcAdjustmentMonths,
      endDate: adj.item.endDate,
      anchorDate: now,
      excludeAdjustmentId: adjustmentId,
    });

    return { oldAmount, newAmount, nextDueDate };
  });
}

/**
 * Aplica un ajuste IPC manual (sin esperar al PENDING del cron). Crea
 * y aplica el adjustment en una sola transacción con `dueDate = hoy`.
 * El próximo ciclo se programa N meses después de hoy.
 */
export async function applyManualAdjustment(
  tenantId: string,
  itemId: string,
  input: ApplyAdjustmentInput,
  ctx: { userId: string },
): Promise<{ newAmount: number; oldAmount: number; nextDueDate: Date | null }> {
  if (!Number.isFinite(input.pct) || input.pct <= -100) {
    throw new Error("Porcentaje inválido");
  }
  return prisma.$transaction(async (tx) => {
    const item = await tx.financeCashflowItem.findFirst({
      where: { id: itemId, tenantId, isActive: true },
      select: {
        id: true,
        amount: true,
        currency: true,
        hasIpcAdjustment: true,
        ipcAdjustmentMonths: true,
        endDate: true,
      },
    });
    if (!item) throw new Error("Item no encontrado o inactivo");
    if (!item.hasIpcAdjustment) {
      throw new Error("El contrato no tiene ajuste de IPC habilitado");
    }
    if (item.currency !== "CLP") {
      throw new Error("El ajuste IPC solo aplica a contratos en CLP");
    }

    const now = new Date();
    const today = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    // Fecha de vigencia del reajuste: la elegida por el usuario o hoy.
    // Normalizamos a UTC midnight para que el unique index (itemId, dueDate)
    // no choque por diferencia de horas.
    const effectiveDate = input.dueDate
      ? new Date(
          Date.UTC(
            input.dueDate.getUTCFullYear(),
            input.dueDate.getUTCMonth(),
            input.dueDate.getUTCDate(),
          ),
        )
      : today;
    const oldAmount = Number(item.amount);
    const newAmount = Math.round(oldAmount * (1 + input.pct / 100) * 100) / 100;

    const adj = await tx.financeContractIpcAdjustment.create({
      data: {
        tenantId,
        itemId,
        dueDate: effectiveDate,
        status: "APPLIED",
        appliedPct: input.pct,
        oldAmount,
        newAmount,
        appliedAt: now,
        appliedBy: ctx.userId,
        notes: input.notes ?? null,
      },
    });

    await tx.financeCashflowItem.update({
      where: { id: itemId },
      data: { amount: newAmount },
    });

    await tx.financeCashflowOccurrence.deleteMany({
      where: {
        tenantId,
        itemId,
        scheduledDate: { gte: effectiveDate },
        status: "PROJECTED",
      },
    });

    const nextDueDate = await rescheduleNextPending(tx, {
      tenantId,
      itemId,
      hasIpcAdjustment: item.hasIpcAdjustment,
      ipcAdjustmentMonths: item.ipcAdjustmentMonths,
      endDate: item.endDate,
      anchorDate: effectiveDate,
      excludeAdjustmentId: adj.id,
    });

    return { oldAmount, newAmount, nextDueDate };
  });
}

/**
 * Revierte un reajuste IPC APPLIED: restaura `item.amount` al valor
 * previo (`oldAmount`), borra el registro del historial y limpia las
 * ocurrencias proyectadas desde su `dueDate` para que se regeneren al
 * monto restaurado. También borra cualquier PENDING futuro y regenera
 * uno nuevo anclado al último APPLIED restante (o vacío si no hay
 * más historial).
 */
export async function revertAdjustment(
  tenantId: string,
  adjustmentId: string,
  ctx: { userId: string },
): Promise<{ restoredAmount: number; nextDueDate: Date | null }> {
  void ctx;
  return prisma.$transaction(async (tx) => {
    const adj = await tx.financeContractIpcAdjustment.findFirst({
      where: { id: adjustmentId, tenantId, status: "APPLIED" },
      include: {
        item: {
          select: {
            id: true,
            isActive: true,
            endDate: true,
            hasIpcAdjustment: true,
            ipcAdjustmentMonths: true,
          },
        },
      },
    });
    if (!adj) throw new Error("Reajuste no encontrado o no aplicado");
    if (!adj.item || !adj.item.isActive) {
      throw new Error("El item asociado no está activo");
    }
    if (adj.oldAmount === null) {
      throw new Error("El reajuste no tiene snapshot del monto anterior");
    }

    const restoredAmount = Number(adj.oldAmount);

    // Si hay un APPLIED posterior, no podemos revertir éste sin romper
    // la cadena (el siguiente recalculó sobre el monto nuevo). Bloqueamos.
    const laterApplied = await tx.financeContractIpcAdjustment.findFirst({
      where: {
        tenantId,
        itemId: adj.item.id,
        status: "APPLIED",
        dueDate: { gt: adj.dueDate },
      },
      select: { id: true, dueDate: true },
    });
    if (laterApplied) {
      throw new Error(
        "No se puede revertir este reajuste: hay un reajuste posterior aplicado sobre él. Revertí el más reciente primero.",
      );
    }

    await tx.financeCashflowItem.update({
      where: { id: adj.item.id },
      data: { amount: restoredAmount },
    });

    await tx.financeCashflowOccurrence.deleteMany({
      where: {
        tenantId,
        itemId: adj.item.id,
        scheduledDate: { gte: adj.dueDate },
        status: "PROJECTED",
      },
    });

    await tx.financeContractIpcAdjustment.delete({
      where: { id: adjustmentId },
    });

    // Reprogramar el próximo PENDING anclado al último APPLIED restante
    // (si existe), o al hoy si no hay historial previo. Si el contrato
    // no tiene IPC habilitado, no se crea nada.
    const lastApplied = await tx.financeContractIpcAdjustment.findFirst({
      where: {
        tenantId,
        itemId: adj.item.id,
        status: "APPLIED",
      },
      orderBy: { dueDate: "desc" },
      select: { id: true, dueDate: true },
    });
    const anchor = lastApplied?.dueDate ?? new Date();
    const nextDueDate = await rescheduleNextPending(tx, {
      tenantId,
      itemId: adj.item.id,
      hasIpcAdjustment: adj.item.hasIpcAdjustment,
      ipcAdjustmentMonths: adj.item.ipcAdjustmentMonths,
      endDate: adj.item.endDate,
      anchorDate: anchor,
      excludeAdjustmentId: lastApplied?.id ?? adjustmentId,
    });

    return { restoredAmount, nextDueDate };
  });
}

interface RescheduleInput {
  tenantId: string;
  itemId: string;
  hasIpcAdjustment: boolean;
  ipcAdjustmentMonths: number | null;
  endDate: Date | null;
  anchorDate: Date;
  excludeAdjustmentId: string;
}

async function rescheduleNextPending(
  // biome-ignore lint/suspicious/noExplicitAny: prisma transaction client
  tx: any,
  input: RescheduleInput,
): Promise<Date | null> {
  if (
    !input.hasIpcAdjustment ||
    !input.ipcAdjustmentMonths ||
    input.ipcAdjustmentMonths <= 0
  ) {
    return null;
  }

  // Borrar otros PENDING del item: el calendario cambió (anclado al
  // momento del reajuste real, no al teórico original).
  await tx.financeContractIpcAdjustment.deleteMany({
    where: {
      tenantId: input.tenantId,
      itemId: input.itemId,
      status: "PENDING",
      id: { not: input.excludeAdjustmentId },
    },
  });

  const nextDue = addMonthsUtc(input.anchorDate, input.ipcAdjustmentMonths);
  if (input.endDate && nextDue > input.endDate) return null;

  await tx.financeContractIpcAdjustment.create({
    data: {
      tenantId: input.tenantId,
      itemId: input.itemId,
      dueDate: nextDue,
      status: "PENDING",
    },
  });
  return nextDue;
}

/**
 * Lista todos los ajustes IPC (APPLIED + PENDING) de un item, ordenados
 * por fecha. Usado por la UI de historial en la tarjeta del contrato.
 */
export async function listAdjustmentsByItem(
  tenantId: string,
  itemId: string,
): Promise<
  Array<{
    id: string;
    dueDate: Date;
    status: "PENDING" | "APPLIED";
    appliedPct: number | null;
    oldAmount: number | null;
    newAmount: number | null;
    appliedAt: Date | null;
    appliedBy: string | null;
    notes: string | null;
  }>
> {
  const rows = await prisma.financeContractIpcAdjustment.findMany({
    where: { tenantId, itemId },
    orderBy: { dueDate: "desc" },
    select: {
      id: true,
      dueDate: true,
      status: true,
      appliedPct: true,
      oldAmount: true,
      newAmount: true,
      appliedAt: true,
      appliedBy: true,
      notes: true,
    },
  });
  return rows.map((r) => ({
    id: r.id,
    dueDate: r.dueDate,
    status: r.status as "PENDING" | "APPLIED",
    appliedPct: r.appliedPct === null ? null : Number(r.appliedPct),
    oldAmount: r.oldAmount === null ? null : Number(r.oldAmount),
    newAmount: r.newAmount === null ? null : Number(r.newAmount),
    appliedAt: r.appliedAt,
    appliedBy: r.appliedBy,
    notes: r.notes,
  }));
}
