import "server-only";
import { prisma } from "@/lib/prisma";
import { bucketKeyFor } from "./bucket-matcher";

export interface MatchDraftToOccurrenceInput {
  tenantId: string;
  dteId: string;
  crmAccountId?: string | null;
  installationId?: string | null;
  /** Fecha de emisión esperada del DTE (FinanceDte.date). */
  expectedDate: Date;
  /** Monto total CLP del DTE para desempate por amount. */
  amountClp: number;
}

/**
 * Busca una occurrence PROYECTADA (source=CONTRACT) del mismo cliente/instalación
 * usando una ventana BIDIRECCIONAL adaptativa por recurrencia del item:
 * WEEKLY±14d, BIWEEKLY±21d, MONTHLY±45d, QUARTERLY±90d, YEARLY±180d,
 * ONCE/fallback±60d.
 *
 * Estrategia: query única con ventana amplia (±180d) y filtro en memoria
 * por ventana específica de cada item.
 *
 * Si hay varias candidatas, gana la MÁS CERCANA en días a la fecha del DTE.
 * En empate de distancia, desempata por monto más cercano.
 *
 * Vincula la occurrence al DTE seteando dteId. Idempotente: si el DTE ya
 * tiene una occurrence vinculada, no hace nada.
 */
export async function matchDraftToOccurrence(
  input: MatchDraftToOccurrenceInput,
): Promise<{ occurrenceId: string } | null> {
  if (!input.crmAccountId && !input.installationId) return null;

  // Guard NC/ND (dteType 56 / 61): nunca enganchar este matcher de
  // contrato. NCs y ND ajustan al DTE original (vía referenceDteId),
  // no son items proyectados independientes. Si la NC se enganchara,
  // aparecería como "factura" dentro de la celda del contrato — lo
  // que es contablemente incorrecto.
  //
  // Defense in depth: el guard vive acá en el matcher en vez de
  // duplicarse en cada caller (dte-draft, dte-issuer, rcv-ventas-sync).
  // Costo: una query de PK por llamada. Acceptable.
  const dteMeta = await prisma.financeDte.findUnique({
    where: { id: input.dteId },
    select: { dteType: true },
  });
  if (!dteMeta || dteMeta.dteType === 56 || dteMeta.dteType === 61) {
    return null;
  }

  // Guard de idempotencia: si el DTE ya tiene una occurrence vinculada, no
  // buscar más. Esto permite llamar al matcher desde múltiples puntos
  // (createDraft, issueDraft, issueDte directo, RCV sync, backfill).
  const existing = await prisma.financeCashflowOccurrence.findFirst({
    where: { tenantId: input.tenantId, dteId: input.dteId },
    select: { id: true },
  });
  if (existing) return { occurrenceId: existing.id };

  // Ventana bidireccional adaptativa por `recurrence` del item. Antes era
  // [DTE.date, primer día del mes siguiente) — eso dejaba huérfanos los
  // casos donde el contrato proyecta antes del cobro real (cuota del 5
  // cobrada el 15) o los contratos QUARTERLY/YEARLY donde la cuota
  // adyacente cae en mes distinto.
  //
  // Estrategia: cargar ventana amplia (±180 días) y filtrar en memoria
  // por la ventana específica de cada item. Una sola query.
  const MAX_WINDOW_DAYS = 180;
  const expectedMs = input.expectedDate.getTime();
  const dateFrom = new Date(expectedMs - MAX_WINDOW_DAYS * 86_400_000);
  const dateTo = new Date(expectedMs + MAX_WINDOW_DAYS * 86_400_000);

  const items = await prisma.financeCashflowItem.findMany({
    where: {
      tenantId: input.tenantId,
      isActive: true,
      source: "CONTRACT",
      OR: [
        input.installationId ? { installationId: input.installationId } : null,
        input.crmAccountId ? { crmAccountId: input.crmAccountId } : null,
      ].filter(Boolean) as object[],
    },
    select: { id: true, recurrence: true },
  });
  if (items.length === 0) return null;

  // Matching por bucket: la occurrence candidata debe caer en el mismo
  // bucket (mes/semana/trimestre/año) que la fecha del DTE. Reemplaza
  // la ventana ±N días previa que tenía tolerancias inconsistentes con
  // los otros matchers.
  const recurrenceByItemId = new Map<string, string>();
  for (const it of items) recurrenceByItemId.set(it.id, it.recurrence);

  const candidatesRaw = await prisma.financeCashflowOccurrence.findMany({
    where: {
      tenantId: input.tenantId,
      itemId: { in: items.map((i) => i.id) },
      scheduledDate: { gte: dateFrom, lte: dateTo },
      status: "PROJECTED",
      dteId: null,
    },
    select: { id: true, scheduledDate: true, amountClp: true, itemId: true },
  });
  const candidates = candidatesRaw.filter((c) => {
    const rec = recurrenceByItemId.get(c.itemId ?? "") ?? "MONTHLY";
    return bucketKeyFor(c.scheduledDate, rec) === bucketKeyFor(input.expectedDate, rec);
  });
  if (candidates.length === 0) return null;

  // Ganador: menor distancia en días al DTE. Empate por fecha -> monto
  // más cercano al del DTE. Antes era "primera posterior cronológica";
  // ahora es "más cercana en cualquier dirección".
  candidates.sort((a, b) => {
    const distA = Math.abs(a.scheduledDate.getTime() - expectedMs);
    const distB = Math.abs(b.scheduledDate.getTime() - expectedMs);
    if (distA !== distB) return distA - distB;
    const amtA = Math.abs(Number(a.amountClp) - input.amountClp);
    const amtB = Math.abs(Number(b.amountClp) - input.amountClp);
    return amtA - amtB;
  });

  const winner = candidates[0];
  await prisma.financeCashflowOccurrence.update({
    where: { id: winner.id },
    data: { dteId: input.dteId },
  });
  return { occurrenceId: winner.id };
}

/**
 * Alias del matcher para flujos que no parten de un draft (emisión directa,
 * RCV sync, backfill). Comparten la misma lógica e idempotencia.
 */
export const matchDteToOccurrence = matchDraftToOccurrence;

/**
 * Re-asigna las occurrences ya vinculadas a un draft DTE al nuevo DTE emitido.
 * Se llama desde issueDraftDte() antes de borrar el draft.
 */
export async function rebindDraftOccurrencesToIssued(
  tenantId: string,
  oldDraftId: string,
  newIssuedDteId: string,
): Promise<number> {
  const result = await prisma.financeCashflowOccurrence.updateMany({
    where: { tenantId, dteId: oldDraftId },
    data: { dteId: newIssuedDteId },
  });
  return result.count;
}
