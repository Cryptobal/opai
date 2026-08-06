import "server-only";
import { prisma } from "@/lib/prisma";
import type { SettlementMode } from "./residual";
import { isMondayYmd, ymdToDate } from "./weeks";

export interface CellSettlementDto {
  rowId: string;
  weekStart: string;
  mode: SettlementMode;
  closedProjectedClp: number | null;
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

/**
 * Upsert / borrado del modo de liquidación.
 * mode === "AUTO" ⇒ deleteMany (ausencia = default AUTO).
 */
export async function upsertCellSettlement(
  tenantId: string,
  rowId: string,
  weekStart: string,
  mode: SettlementMode,
  closedProjectedClp: number | null | undefined,
  updatedBy: string | null,
): Promise<CellSettlementDto> {
  await assertRow(tenantId, rowId);
  const week = assertWeek(weekStart);

  if (mode === "AUTO") {
    await prisma.financeFlowCellSettlement.deleteMany({
      where: { tenantId, rowId, weekStart: week },
    });
    return {
      rowId,
      weekStart,
      mode: "AUTO",
      closedProjectedClp: null,
      updatedBy: null,
    };
  }

  const projected =
    closedProjectedClp == null || !Number.isFinite(closedProjectedClp)
      ? null
      : closedProjectedClp;

  const saved = await prisma.financeFlowCellSettlement.upsert({
    where: { tenantId_rowId_weekStart: { tenantId, rowId, weekStart: week } },
    create: {
      tenantId,
      rowId,
      weekStart: week,
      mode: "CLOSED",
      closedProjectedClp: projected,
      updatedBy,
    },
    update: {
      mode: "CLOSED",
      closedProjectedClp: projected,
      updatedBy,
    },
  });

  return {
    rowId,
    weekStart,
    mode: "CLOSED",
    closedProjectedClp:
      saved.closedProjectedClp == null ? null : Number(saved.closedProjectedClp),
    updatedBy: saved.updatedBy,
  };
}

/** Settlements CLOSED del tenant en [from, to] → Map<rowId, Map<weekYmd, mode>>. */
export async function loadCellSettlements(
  tenantId: string,
  from: Date,
  to: Date,
): Promise<Map<string, Map<string, SettlementMode>>> {
  const rows = await prisma.financeFlowCellSettlement.findMany({
    where: {
      tenantId,
      weekStart: { gte: from, lte: to },
      mode: "CLOSED",
    },
    select: { rowId: true, weekStart: true, mode: true },
  });
  const byRow = new Map<string, Map<string, SettlementMode>>();
  for (const n of rows) {
    const ymd = n.weekStart.toISOString().slice(0, 10);
    let m = byRow.get(n.rowId);
    if (!m) {
      m = new Map();
      byRow.set(n.rowId, m);
    }
    m.set(ymd, n.mode as SettlementMode);
  }
  return byRow;
}
