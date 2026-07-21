import "server-only";
import { prisma } from "@/lib/prisma";
import { isMondayYmd, ymdToDate } from "./weeks";

export interface PlanCellDto {
  rowId: string;
  /** Lunes ISO YYYY-MM-DD. */
  weekStart: string;
  /** 0 = celda borrada (sin plan). */
  amount: number;
  updatedBy: string | null;
}

async function assertEditableRow(tenantId: string, rowId: string) {
  const row = await prisma.financeFlowRow.findFirst({
    where: { id: rowId, tenantId },
    select: { id: true, archivedAt: true },
  });
  if (!row) throw new Error("Fila no encontrada");
  if (row.archivedAt) throw new Error("Fila archivada: el plan es de solo lectura");
  return row;
}

function assertWeek(weekStart: string): Date {
  if (!isMondayYmd(weekStart)) {
    throw new Error(`weekStart debe ser lunes ISO (YYYY-MM-DD): ${weekStart}`);
  }
  const d = ymdToDate(weekStart);
  if (!d) throw new Error(`weekStart inválido: ${weekStart}`);
  return d;
}

/** Lee la celda desde DB (Verdad Verificada tras cada write). */
async function readCell(
  tenantId: string,
  rowId: string,
  weekStart: string,
): Promise<PlanCellDto> {
  const week = ymdToDate(weekStart);
  const cell = week
    ? await prisma.financeFlowPlanCell.findFirst({
        where: { tenantId, rowId, weekStart: week },
      })
    : null;
  return {
    rowId,
    weekStart,
    amount: cell ? Number(cell.amount) : 0,
    updatedBy: cell?.updatedBy ?? null,
  };
}

/**
 * Upsert de una celda plan. amount 0 ⇒ delete (celda vacía). El plan es
 * signado (FINANCIAMIENTO puede ser negativo). Retorna la celda releída
 * de DB, nunca el eco del input.
 */
export async function upsertCell(
  tenantId: string,
  rowId: string,
  weekStart: string,
  amount: number,
  updatedBy: string | null,
): Promise<PlanCellDto> {
  await assertEditableRow(tenantId, rowId);
  const week = assertWeek(weekStart);
  if (!Number.isFinite(amount)) throw new Error("Monto inválido");

  if (amount === 0) {
    await prisma.financeFlowPlanCell.deleteMany({
      where: { tenantId, rowId, weekStart: week },
    });
  } else {
    await prisma.financeFlowPlanCell.upsert({
      where: { tenantId_rowId_weekStart: { tenantId, rowId, weekStart: week } },
      create: { tenantId, rowId, weekStart: week, amount, updatedBy },
      update: { amount, updatedBy },
    });
  }
  return readCell(tenantId, rowId, weekStart);
}

/**
 * Fill-right estilo Sheets: aplica el mismo monto a N semanas de la fila.
 * amount 0 ⇒ borra las celdas. Retorna las celdas releídas de DB.
 */
export async function bulkFill(
  tenantId: string,
  rowId: string,
  weekStarts: string[],
  amount: number,
  updatedBy: string | null,
): Promise<PlanCellDto[]> {
  await assertEditableRow(tenantId, rowId);
  if (!Number.isFinite(amount)) throw new Error("Monto inválido");
  const weeks = weekStarts.map((w) => ({ ymd: w, date: assertWeek(w) }));
  if (weeks.length === 0) return [];

  if (amount === 0) {
    await prisma.financeFlowPlanCell.deleteMany({
      where: { tenantId, rowId, weekStart: { in: weeks.map((w) => w.date) } },
    });
  } else {
    await prisma.$transaction(
      weeks.map((w) =>
        prisma.financeFlowPlanCell.upsert({
          where: {
            tenantId_rowId_weekStart: { tenantId, rowId, weekStart: w.date },
          },
          create: { tenantId, rowId, weekStart: w.date, amount, updatedBy },
          update: { amount, updatedBy },
        }),
      ),
    );
  }
  return Promise.all(weeks.map((w) => readCell(tenantId, rowId, w.ymd)));
}

/** Celdas plan del tenant en el rango [from, to] (lunes ISO), por fila. */
export async function loadPlanCells(
  tenantId: string,
  from: Date,
  to: Date,
): Promise<Map<string, Map<string, number>>> {
  const cells = await prisma.financeFlowPlanCell.findMany({
    where: { tenantId, weekStart: { gte: from, lte: to } },
    select: { rowId: true, weekStart: true, amount: true },
  });
  const byRow = new Map<string, Map<string, number>>();
  for (const c of cells) {
    const ymd = c.weekStart.toISOString().slice(0, 10);
    let m = byRow.get(c.rowId);
    if (!m) {
      m = new Map();
      byRow.set(c.rowId, m);
    }
    m.set(ymd, Number(c.amount));
  }
  return byRow;
}
