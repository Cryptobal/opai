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

const DATE_TOLERANCE_DAYS = 15;

/**
 * Busca una occurrence PROYECTADA (source=CONTRACT) del mismo cliente/instalación
 * con scheduledDate ±15d del expectedDate y, en empate, la más cercana en monto.
 *
 * Vincula la occurrence al DTE seteando dteId. Idempotente: si ya está
 * vinculada al mismo dteId, no hace nada. Si está vinculada a OTRO dteId,
 * no la sobreescribe (deja log).
 *
 * Si no encuentra match, devuelve null sin error.
 */
export async function matchDraftToOccurrence(
  input: MatchDraftToOccurrenceInput,
): Promise<{ occurrenceId: string } | null> {
  if (!input.crmAccountId && !input.installationId) return null;

  const dateFrom = new Date(input.expectedDate);
  dateFrom.setDate(dateFrom.getDate() - DATE_TOLERANCE_DAYS);
  const dateTo = new Date(input.expectedDate);
  dateTo.setDate(dateTo.getDate() + DATE_TOLERANCE_DAYS);

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
      scheduledDate: { gte: dateFrom, lte: dateTo },
      status: "PROJECTED",
      dteId: null,
    },
    select: { id: true, scheduledDate: true, amountClp: true },
  });
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const dA = Math.abs(a.scheduledDate.getTime() - input.expectedDate.getTime());
    const dB = Math.abs(b.scheduledDate.getTime() - input.expectedDate.getTime());
    if (dA !== dB) return dA - dB;
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
