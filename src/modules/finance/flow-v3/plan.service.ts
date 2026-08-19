import "server-only";
import { prisma } from "@/lib/prisma";
import { recordPlanChange } from "./plan-history.service";
import { normalizeFinancingPlanAmount } from "./residual";
import { isMondayYmd, weekStartYmd, ymdToDate } from "./weeks";

export interface PlanCellDto {
  rowId: string;
  /** Lunes ISO YYYY-MM-DD. */
  weekStart: string;
  /** 0 = celda borrada (sin plan). */
  amount: number;
  updatedBy: string | null;
}

export interface PlanAuditCtx {
  userId: string | null;
  userEmail?: string | null;
}

type EditableRow = {
  id: string;
  archivedAt: Date | null;
  section: string;
  canonicalKey: string | null;
};

async function assertEditableRow(tenantId: string, rowId: string): Promise<EditableRow> {
  const row = await prisma.financeFlowRow.findFirst({
    where: { id: rowId, tenantId },
    select: { id: true, archivedAt: true, section: true, canonicalKey: true },
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
 * de DB, nunca el eco del input. Deja rastro en AuditLog para el historial
 * del popover de capas.
 */
export async function upsertCell(
  tenantId: string,
  rowId: string,
  weekStart: string,
  amount: number,
  updatedBy: string | null,
  audit?: PlanAuditCtx,
): Promise<PlanCellDto> {
  const row = await assertEditableRow(tenantId, rowId);
  const week = assertWeek(weekStart);
  assertPlanWeekWritable(row, weekStart);
  if (!Number.isFinite(amount)) throw new Error("Monto inválido");
  // RETIRO_SOCIO / FACTORING / DEVOL_*: magnitud tipada → siempre egreso (−).
  amount = normalizeFinancingPlanAmount(row.section, amount, row.canonicalKey);

  const previous = await readCell(tenantId, rowId, weekStart);

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

  await recordPlanChange({
    tenantId,
    userId: audit?.userId ?? updatedBy,
    userEmail: audit?.userEmail,
    rowId,
    weekStart,
    previousAmount: previous.amount,
    newAmount: amount,
  });

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
  audit?: PlanAuditCtx,
): Promise<PlanCellDto[]> {
  const row = await assertEditableRow(tenantId, rowId);
  if (!Number.isFinite(amount)) throw new Error("Monto inválido");
  amount = normalizeFinancingPlanAmount(row.section, amount, row.canonicalKey);
  const weeks = weekStarts.map((w) => ({ ymd: w, date: assertWeek(w) }));
  for (const w of weeks) assertPlanWeekWritable(row, w.ymd);
  if (weeks.length === 0) return [];

  const previous = await Promise.all(weeks.map((w) => readCell(tenantId, rowId, w.ymd)));

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

  await Promise.all(
    previous.map((p) =>
      recordPlanChange({
        tenantId,
        userId: audit?.userId ?? updatedBy,
        userEmail: audit?.userEmail,
        rowId,
        weekStart: p.weekStart,
        previousAmount: p.amount,
        newAmount: amount,
      }),
    ),
  );

  return Promise.all(weeks.map((w) => readCell(tenantId, rowId, w.ymd)));
}

/** Tope alineado con cell-note.service (evitar import circular server-only). */
const CELL_NOTE_MAX = 2000;

/**
 * Mueve el monto de plan de una semana a otra dentro de la MISMA fila (drag &
 * drop / "Mover plan a…"). El origen queda en 0; el destino recibe el monto
 * SUMADO al que ya tuviera. Si el origen tiene nota de celda, también viaja
 * al destino (se concatena con salto de línea si el destino ya tenía nota).
 * La suma se hace en la base de datos dentro de una transacción (cero
 * aritmética financiera en JS). Devuelve ambas celdas releídas (Verdad
 * Verificada). Rechaza semanas selladas se valida en la ruta.
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

    // Nota de celda viaja con el plan (misma semántica que el monto: origen limpio).
    const originNote = await tx.financeFlowCellNote.findFirst({
      where: { tenantId, rowId, weekStart: fromDate },
      select: { body: true },
    });
    const originBody = originNote?.body?.trim() ?? "";
    if (!originBody) return;

    const destNote = await tx.financeFlowCellNote.findFirst({
      where: { tenantId, rowId, weekStart: toDate },
      select: { body: true },
    });
    const destBody = destNote?.body?.trim() ?? "";
    const merged = destBody ? `${destBody}\n${originBody}` : originBody;
    const body = merged.length > CELL_NOTE_MAX ? merged.slice(0, CELL_NOTE_MAX) : merged;

    await tx.financeFlowCellNote.upsert({
      where: { tenantId_rowId_weekStart: { tenantId, rowId, weekStart: toDate } },
      create: { tenantId, rowId, weekStart: toDate, body, updatedBy },
      update: { body, updatedBy },
    });
    await tx.financeFlowCellNote.deleteMany({
      where: { tenantId, rowId, weekStart: fromDate },
    });
  });

  const [from, to] = await Promise.all([
    readCell(tenantId, rowId, fromWeek),
    readCell(tenantId, rowId, toWeek),
  ]);
  return { from, to };
}

/**
 * Mueve una proyección paramétrica (capa committed) creando overrides de plan:
 * origen → 0, destino → amount (signado). Valida semanas lunes ISO; el caller
 * debe haber filtrado selladas/pasadas vía assertV3WeeksWritable.
 */
export async function moveParametricCommitted(
  tenantId: string,
  rowId: string,
  fromWeek: string,
  toWeek: string,
  amount: number,
  updatedBy: string | null,
  audit?: PlanAuditCtx,
): Promise<{ from: PlanCellDto; to: PlanCellDto }> {
  if (!Number.isFinite(amount) || amount === 0) {
    throw new Error("Monto inválido para mover proyección");
  }
  if (fromWeek === toWeek) {
    const cell = await readCell(tenantId, rowId, fromWeek);
    return { from: cell, to: cell };
  }
  await assertV3WritableLocal(tenantId, rowId, fromWeek, toWeek);
  const from = await upsertCell(tenantId, rowId, fromWeek, 0, updatedBy, audit);
  const to = await upsertCell(tenantId, rowId, toWeek, amount, updatedBy, audit);
  return { from, to };
}

/** Validación local mínima (fila + lunes); sellado lo valida la ruta. */
async function assertV3WritableLocal(
  tenantId: string,
  rowId: string,
  fromWeek: string,
  toWeek: string,
): Promise<void> {
  const row = await assertEditableRow(tenantId, rowId);
  assertWeek(fromWeek);
  assertWeek(toWeek);
  assertPlanWeekWritable(row, fromWeek);
  assertPlanWeekWritable(row, toWeek);
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
