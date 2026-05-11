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
}

/**
 * Aplica el ajuste IPC: actualiza `item.amount`, deja snapshot old/new,
 * marca el adjustment como APPLIED, y borra ocurrencias proyectadas
 * desde la fecha en adelante para que se regeneren con el nuevo monto.
 */
export async function applyAdjustment(
  tenantId: string,
  adjustmentId: string,
  input: ApplyAdjustmentInput,
  ctx: { userId: string },
): Promise<{ newAmount: number; oldAmount: number }> {
  if (!Number.isFinite(input.pct) || input.pct <= -100) {
    throw new Error("Porcentaje inválido");
  }
  return prisma.$transaction(async (tx) => {
    const adj = await tx.financeContractIpcAdjustment.findFirst({
      where: { id: adjustmentId, tenantId },
      include: { item: { select: { id: true, amount: true, isActive: true } } },
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
        appliedAt: new Date(),
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

    return { oldAmount, newAmount };
  });
}
