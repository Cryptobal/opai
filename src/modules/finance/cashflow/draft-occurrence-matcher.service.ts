import "server-only";
import { prisma } from "@/lib/prisma";

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
 * cuya scheduledDate esté DENTRO DEL MISMO MES que el DTE Y sea POSTERIOR
 * (>=) a la fecha del DTE. Es decir: el DTE se "adelanta" a una cuota del
 * mismo mes que todavía no ha llegado.
 *
 * Casos excluidos del auto-bind (quedan para que el usuario los mueva
 * manualmente con drag&drop, apareciendo como fila propia del DTE):
 *  - DTE atrasado: scheduledDate < DTE.date dentro del mismo mes.
 *  - DTE de otro mes que la proyección.
 *
 * Si hay varias proyecciones posteriores en el mismo mes (raro: contratos
 * quincenales), gana la PRIMERA cronológicamente —natural: facturas y la
 * próxima cuota se cobra. En empate exacto, desempata el monto más cercano.
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

  // Ventana: [DTE.date, primer día del mes siguiente). Captura cuotas del
  // mismo mes-año posteriores o iguales a la fecha de emisión.
  const dateFrom = new Date(input.expectedDate);
  const dateTo = new Date(
    Date.UTC(dateFrom.getUTCFullYear(), dateFrom.getUTCMonth() + 1, 1),
  );

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
    select: { id: true },
  });
  if (items.length === 0) return null;

  const candidates = await prisma.financeCashflowOccurrence.findMany({
    where: {
      tenantId: input.tenantId,
      itemId: { in: items.map((i) => i.id) },
      scheduledDate: { gte: dateFrom, lt: dateTo },
      status: "PROJECTED",
      dteId: null,
    },
    select: { id: true, scheduledDate: true, amountClp: true },
  });
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const dA = a.scheduledDate.getTime();
    const dB = b.scheduledDate.getTime();
    if (dA !== dB) return dA - dB; // primera posterior cronológicamente
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
