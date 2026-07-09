import "server-only";
import type { Prisma, PrismaClient } from "@prisma/client";
import {
  expandRecurrence,
  itemForRecurrenceExpansion,
} from "./recurrence-engine";

/** Cliente Prisma o el `tx` de una $transaction. */
type Db = PrismaClient | Prisma.TransactionClient;

const IVA_RATE = 0.19;

/**
 * Una proyección "consumible" en una categoría + semana. Puede ser una
 * occurrence ya materializada (PROJECTED en BD) o una virtual (que sólo
 * existe al expandir la recurrencia del item — caso típico de TURNOS_EXTRA,
 * PAYROLL, etc., que no materializan sus cuotas).
 */
export type ConsumableProjection =
  | {
      kind: "materialized";
      occurrenceId: string;
      itemId: string;
      scheduledDate: Date;
      /** Monto proyectado BRUTO (con IVA si la categoría es afecta). */
      projectedGrossClp: number;
    }
  | {
      kind: "virtual";
      itemId: string;
      scheduledDate: Date;
      projectedGrossClp: number;
    };

/**
 * Busca la occurrence PROJECTED más cercana al `txDate` en la categoría
 * `categoryId` dentro de la semana [weekStart, weekEnd]. Considera tanto
 * cuotas materializadas como virtuales (proyección pura de la recurrencia).
 *
 * Devuelve `null` si no hay nada consumible (→ el motor crea real puro).
 */
export async function resolveConsumableProjection(
  db: Db,
  args: {
    tenantId: string;
    categoryId: string;
    isTaxExempt: boolean;
    weekStart: Date;
    weekEnd: Date;
    txDate: Date;
  },
): Promise<ConsumableProjection | null> {
  const { tenantId, categoryId, isTaxExempt, weekStart, weekEnd, txDate } = args;
  const ivaFactor = isTaxExempt ? 1 : 1 + IVA_RATE;
  const txMs = txDate.getTime();

  // 1) Materializadas PROJECTED disponibles (sin banco). La más cercana manda.
  const mats = await db.financeCashflowOccurrence.findMany({
    where: {
      tenantId,
      status: "PROJECTED",
      bankTransactionId: null,
      scheduledDate: { gte: weekStart, lte: weekEnd },
      item: { tenantId, categoryId, isActive: true },
    },
    select: { id: true, itemId: true, scheduledDate: true, amountClp: true, amountOverride: true },
  });
  if (mats.length > 0) {
    const best = mats.sort(
      (a, b) =>
        Math.abs(a.scheduledDate.getTime() - txMs) -
        Math.abs(b.scheduledDate.getTime() - txMs),
    )[0];
    const gross =
      best.amountOverride != null
        ? Number(best.amountOverride)
        : Math.round(Number(best.amountClp) * ivaFactor);
    return {
      kind: "materialized",
      occurrenceId: best.id,
      itemId: best.itemId,
      scheduledDate: best.scheduledDate,
      projectedGrossClp: gross,
    };
  }

  // 2) Virtuales: expandir la recurrencia de los items de la categoría dentro
  //    de la semana y descartar las fechas ya reclamadas por una occurrence
  //    no disponible (PAID/CONFIRMED/CANCELLED o ya conciliada).
  const items = await db.financeCashflowItem.findMany({
    where: { tenantId, categoryId, isActive: true },
    select: {
      id: true,
      amount: true,
      recurrence: true,
      startDate: true,
      endDate: true,
      dayOfMonth: true,
      dayOfWeek: true,
      monthOfYear: true,
      source: true,
      sourceRefId: true,
      emiteProforma: true,
      diaEmisionProforma: true,
      diasFacturaDesdeProforma: true,
      diaEmisionFactura: true,
      mesFacturaRelativo: true,
      diasCobroDesdeFactura: true,
    },
  });
  if (items.length === 0) return null;

  const claimed = await db.financeCashflowOccurrence.findMany({
    where: {
      tenantId,
      itemId: { in: items.map((i) => i.id) },
      OR: [
        { status: { in: ["PAID", "CONFIRMED", "CANCELLED"] } },
        { bankTransactionId: { not: null } },
      ],
    },
    select: { itemId: true, scheduledDate: true },
  });
  const claimedKeys = new Set(
    claimed.map((c) => `${c.itemId}|${c.scheduledDate.toISOString().slice(0, 10)}`),
  );

  let best: { itemId: string; date: Date; gross: number } | null = null;
  for (const item of items) {
    const dates = expandRecurrence(itemForRecurrenceExpansion(item), weekStart, weekEnd);
    const gross = Math.round(Number(item.amount) * ivaFactor);
    for (const d of dates) {
      const key = `${item.id}|${d.toISOString().slice(0, 10)}`;
      if (claimedKeys.has(key)) continue;
      const cand = { itemId: item.id, date: d, gross };
      if (!best || Math.abs(d.getTime() - txMs) < Math.abs(best.date.getTime() - txMs)) {
        best = cand;
      }
    }
  }
  if (!best) return null;
  return {
    kind: "virtual",
    itemId: best.itemId,
    scheduledDate: best.date,
    projectedGrossClp: best.gross,
  };
}
