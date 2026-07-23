import "server-only";
import { prisma } from "@/lib/prisma";
import { isMondayYmd, weekStartYmd, ymdToDate } from "./weeks";

export interface PlanCellDto {
  rowId: string;
  /** Lunes ISO YYYY-MM-DD. */
  weekStart: string;
  /** 0 = celda borrada (sin plan). */
  amount: number;
  updatedBy: string | null;
}

type EditableRow = { id: string; archivedAt: Date | null };

async function assertEditableRow(tenantId: string, rowId: string): Promise<EditableRow> {
  const row = await prisma.financeFlowRow.findFirst({
    where: { id: rowId, tenantId },
    select: { id: true, archivedAt: true },
  });
  if (!row) throw new Error("Fila no encontrada");
  return row;
}

/**
 * Una fila archivada NO admite plan nuevo HACIA ADELANTE (semanas ≥ la semana
 * en que se archivó), pero SÍ permite corregir plan de semanas ANTERIORES a su
 * término (K): el histórico sigue siendo editable, solo deja de proyectar. La
 * matriz ya oculta las semanas ≥ cutoff (archivedWeekCutoff en matrix-assemble),
 * así que el plan futuro de una fila archivada no suma.
 */
function assertPlanWeekWritable(row: EditableRow, weekStart: string): void {
  if (row.archivedAt && weekStart >= weekStartYmd(row.archivedAt)) {
    throw new Error("Fila archivada: no admite plan nuevo hacia adelante.");
  }
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
  const row = await assertEditableRow(tenantId, rowId);
  const week = assertWeek(weekStart);
  assertPlanWeekWritable(row, weekStart);
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
  const row = await assertEditableRow(tenantId, rowId);
  if (!Number.isFinite(amount)) throw new Error("Monto inválido");
  const weeks = weekStarts.map((w) => ({ ymd: w, date: assertWeek(w) }));
  for (const w of weeks) assertPlanWeekWritable(row, w.ymd);
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

/**
 * Mueve el monto de plan de una semana a otra dentro de la MISMA fila (drag &
 * drop / "Mover plan a…"). El origen queda en 0; el destino recibe el monto
 * SUMADO al que ya tuviera. La suma se hace en la base de datos dentro de una
 * transacción (cero aritmética financiera en JS). Devuelve ambas celdas
 * releídas (Verdad Verificada). Rechaza semanas selladas se valida en la ruta.
 */
export async function movePlanCell(
  tenantId: string,
  rowId: string,
  fromWeek: string,
  toWeek: string,
  updatedBy: string | null,
): Promise<{ from: PlanCellDto; to: PlanCellDto }> {
  const row = await assertEditableRow(tenantId, rowId);
  const fromDate = assertWeek(fromWeek);
  const toDate = assertWeek(toWeek);
  assertPlanWeekWritable(row, fromWeek);
  assertPlanWeekWritable(row, toWeek);

  if (fromWeek === toWeek) {
    const cell = await readCell(tenantId, rowId, fromWeek);
    return { from: cell, to: cell };
  }

  await prisma.$transaction(async (tx) => {
    const origin = await tx.financeFlowPlanCell.findFirst({
      where: { tenantId, rowId, weekStart: fromDate },
      select: { amount: true },
    });
    const amount = origin ? Number(origin.amount) : 0;
    if (amount === 0) return; // nada que mover

    const dest = await tx.financeFlowPlanCell.findFirst({
      where: { tenantId, rowId, weekStart: toDate },
      select: { amount: true },
    });
    const destAmount = (dest ? Number(dest.amount) : 0) + amount;

    if (destAmount === 0) {
      await tx.financeFlowPlanCell.deleteMany({ where: { tenantId, rowId, weekStart: toDate } });
    } else {
      await tx.financeFlowPlanCell.upsert({
        where: { tenantId_rowId_weekStart: { tenantId, rowId, weekStart: toDate } },
        create: { tenantId, rowId, weekStart: toDate, amount: destAmount, updatedBy },
        update: { amount: destAmount, updatedBy },
      });
    }
    await tx.financeFlowPlanCell.deleteMany({ where: { tenantId, rowId, weekStart: fromDate } });
  });

  const [from, to] = await Promise.all([
    readCell(tenantId, rowId, fromWeek),
    readCell(tenantId, rowId, toWeek),
  ]);
  return { from, to };
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
