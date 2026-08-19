import "server-only";
import { prisma } from "@/lib/prisma";
import { isMondayYmd, weekStartYmd, ymdToDate } from "./weeks";
import { noteCellPreview } from "./cell-note-preview";

const NOTE_MAX = 2000;

export interface CellNoteDto {
  rowId: string;
  weekStart: string;
  body: string | null;
  updatedBy: string | null;
}

export { noteCellPreview };

function assertWeek(weekStart: string): Date {
  if (!isMondayYmd(weekStart)) {
    throw new Error(`weekStart debe ser lunes ISO (YYYY-MM-DD): ${weekStart}`);
  }
  const d = ymdToDate(weekStart);
  if (!d) throw new Error(`weekStart inválido: ${weekStart}`);
  return d;
}

async function assertRow(tenantId: string, rowId: string): Promise<void> {
  const row = await prisma.financeFlowRow.findFirst({
    where: { id: rowId, tenantId },
    select: { id: true },
  });
  if (!row) throw new Error("Fila no encontrada");
}

/** Upsert / borrado de nota de celda. body vacío o null ⇒ delete. */
export async function upsertCellNote(
  tenantId: string,
  rowId: string,
  weekStart: string,
  body: string | null,
  updatedBy: string | null,
): Promise<CellNoteDto> {
  await assertRow(tenantId, rowId);
  const week = assertWeek(weekStart);
  const trimmed = (body ?? "").trim();
  if (trimmed.length > NOTE_MAX) {
    throw new Error(`La nota no puede superar ${NOTE_MAX} caracteres`);
  }

  if (!trimmed) {
    await prisma.financeFlowCellNote.deleteMany({
      where: { tenantId, rowId, weekStart: week },
    });
    return { rowId, weekStart, body: null, updatedBy: null };
  }

  const saved = await prisma.financeFlowCellNote.upsert({
    where: { tenantId_rowId_weekStart: { tenantId, rowId, weekStart: week } },
    create: { tenantId, rowId, weekStart: week, body: trimmed, updatedBy },
    update: { body: trimmed, updatedBy },
  });
  return {
    rowId,
    weekStart,
    body: saved.body,
    updatedBy: saved.updatedBy,
  };
}

/** Notas del tenant en el rango [from, to] (lunes), por fila → semana → body. */
export async function loadCellNotes(
  tenantId: string,
  from: Date,
  to: Date,
): Promise<Map<string, Map<string, string>>> {
  const notes = await prisma.financeFlowCellNote.findMany({
    where: { tenantId, weekStart: { gte: from, lte: to } },
    select: { rowId: true, weekStart: true, body: true },
  });
  const byRow = new Map<string, Map<string, string>>();
  for (const n of notes) {
    const ymd = n.weekStart.toISOString().slice(0, 10);
    let m = byRow.get(n.rowId);
    if (!m) {
      m = new Map();
      byRow.set(n.rowId, m);
    }
    m.set(ymd, n.body);
  }
  return byRow;
}

/**
 * Estampa la misma nota en varias semanas (egreso recurrente al materializar).
 * body vacío/null ⇒ borra notas de esas semanas.
 */
export async function stampCellNotes(
  tenantId: string,
  rowId: string,
  weekStarts: string[],
  body: string | null,
  updatedBy: string | null,
): Promise<number> {
  const unique = [...new Set(weekStarts.filter((w) => isMondayYmd(w)))];
  if (unique.length === 0) return 0;
  let n = 0;
  for (const w of unique) {
    await upsertCellNote(tenantId, rowId, w, body, updatedBy);
    n += 1;
  }
  return n;
}

/**
 * Aplica (o borra) la nota en todas las celdas de plan futuras de la fila
 * (weekStart ≥ semana actual y amount ≠ 0), más la semana ancla.
 */
export async function applyNoteToFuturePlanCells(
  tenantId: string,
  rowId: string,
  anchorWeekStart: string,
  body: string | null,
  updatedBy: string | null,
): Promise<{ weeks: string[] }> {
  await assertRow(tenantId, rowId);
  assertWeek(anchorWeekStart);
  const currentWeek = weekStartYmd(new Date());
  const from = currentWeek < anchorWeekStart ? currentWeek : anchorWeekStart;
  const cells = await prisma.financeFlowPlanCell.findMany({
    where: {
      tenantId,
      rowId,
      weekStart: { gte: ymdToDate(from)! },
      NOT: { amount: 0 },
    },
    select: { weekStart: true },
  });
  const weeks = new Set<string>([anchorWeekStart]);
  for (const c of cells) {
    weeks.add(c.weekStart.toISOString().slice(0, 10));
  }
  const list = [...weeks].sort();
  await stampCellNotes(tenantId, rowId, list, body, updatedBy);
  return { weeks: list };
}
