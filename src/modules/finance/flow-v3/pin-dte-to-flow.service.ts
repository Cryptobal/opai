import "server-only";
import { prisma } from "@/lib/prisma";
import { upsertCell } from "./plan.service";
import { upsertCellNote } from "./cell-note.service";
import { assertV3WeeksWritable } from "./weekly-close.adapter";
import { isMondayYmd } from "./weeks";

const PIN_SECTIONS = new Set(["GAV", "OTROS", "IMPUESTOS", "FINANCIAMIENTO"]);

export interface PinReceivedDteInput {
  tenantId: string;
  userId: string;
  dteId: string;
  rowId: string;
  weekStart: string;
}

export interface PinReceivedDteResult {
  rowId: string;
  weekStart: string;
  amount: number;
  alreadyPinned: boolean;
  folio: number;
  pendingClp: number;
}

function pinNoteMarker(folio: number, issuerName: string): string {
  return `Fijado F°${folio} · ${issuerName}`;
}

/**
 * Fija un DTE recibido puntual al flujo: suma el pendiente a la celda de
 * plan de la fila/semana elegida y deja nota trazable al folio.
 * Idempotente: si la nota ya referencia el folio, no vuelve a sumar.
 */
export async function pinReceivedDteToFlow(
  input: PinReceivedDteInput,
): Promise<PinReceivedDteResult> {
  const { tenantId, userId, dteId, rowId, weekStart } = input;
  if (!isMondayYmd(weekStart)) {
    throw new Error(`weekStart debe ser lunes ISO (YYYY-MM-DD): ${weekStart}`);
  }

  const [dte, row] = await Promise.all([
    prisma.financeDte.findFirst({
      where: { id: dteId, tenantId },
      select: {
        id: true,
        direction: true,
        folio: true,
        issuerName: true,
        amountPending: true,
        paymentStatus: true,
        voidedByCreditNoteId: true,
        siiStatus: true,
      },
    }),
    prisma.financeFlowRow.findFirst({
      where: { id: rowId, tenantId },
      select: { id: true, section: true, archivedAt: true, name: true },
    }),
  ]);

  if (!dte) throw new Error("DTE no encontrado");
  if (dte.direction !== "RECEIVED") {
    throw new Error("Solo se pueden fijar facturas de compra (DTE recibido)");
  }
  if (dte.voidedByCreditNoteId || dte.siiStatus === "ANNULLED") {
    throw new Error("El DTE está anulado");
  }
  const pendingClp = Math.round(Number(dte.amountPending));
  if (pendingClp <= 0) {
    throw new Error("El DTE no tiene saldo pendiente");
  }
  if (!row) throw new Error("Fila no encontrada");
  if (row.archivedAt) throw new Error("Fila archivada: no admite plan nuevo hacia adelante.");
  if (!PIN_SECTIONS.has(row.section)) {
    throw new Error("La fila debe ser de sección GAV, OTROS, IMPUESTOS o FINANCIAMIENTO");
  }

  // Semana cerrada / sellada → 409 en la ruta.
  await assertV3WeeksWritable(tenantId, [weekStart]);

  const weekDate = new Date(`${weekStart}T00:00:00.000Z`);
  const existingNote = await prisma.financeFlowCellNote.findFirst({
    where: { tenantId, rowId, weekStart: weekDate },
    select: { body: true },
  });
  const marker = pinNoteMarker(dte.folio, dte.issuerName);
  const alreadyPinned = !!existingNote?.body?.includes(`F°${dte.folio}`);
  if (alreadyPinned) {
    const cell = await prisma.financeFlowPlanCell.findFirst({
      where: { tenantId, rowId, weekStart: weekDate },
      select: { amount: true },
    });
    return {
      rowId,
      weekStart,
      amount: cell ? Math.round(Number(cell.amount)) : 0,
      alreadyPinned: true,
      folio: dte.folio,
      pendingClp,
    };
  }

  const prevCell = await prisma.financeFlowPlanCell.findFirst({
    where: { tenantId, rowId, weekStart: weekDate },
    select: { amount: true },
  });
  const prevAmount = prevCell ? Math.round(Number(prevCell.amount)) : 0;
  const nextAmount = prevAmount + pendingClp;

  const cell = await upsertCell(tenantId, rowId, weekStart, nextAmount, userId, {
    userId,
  });

  const prevBody = (existingNote?.body ?? "").trim();
  const nextBody = prevBody ? `${prevBody}\n${marker}` : marker;
  await upsertCellNote(tenantId, rowId, weekStart, nextBody, userId);

  return {
    rowId,
    weekStart,
    amount: cell.amount,
    alreadyPinned: false,
    folio: dte.folio,
    pendingClp,
  };
}
