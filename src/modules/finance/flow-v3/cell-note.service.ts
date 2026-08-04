import "server-only";
import { prisma } from "@/lib/prisma";
import { isMondayYmd, ymdToDate } from "./weeks";

const NOTE_MAX = 2000;

export interface CellNoteDto {
  rowId: string;
  weekStart: string;
  body: string | null;
  updatedBy: string | null;
}

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
