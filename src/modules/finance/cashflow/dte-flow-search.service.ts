import "server-only";
import { prisma } from "@/lib/prisma";
import { bucketKeyFor, bucketBoundsFor } from "./recurrence-engine";

export interface DteFlowSearchResult {
  dteId: string;
  folio: number;
  receiverName: string | null;
  totalAmount: number;
  /** Fecha de emisión (yyyy-MM-dd). */
  emissionDate: string;
  /** Fecha con la que se ubica en el flujo (override si existe, si no emisión). */
  placementDate: string;
  weekKey: string;
  weekLabel: string;
  /** Oculta manualmente del flujo. */
  hiddenFromFlow: boolean;
}

/**
 * Busca facturas EMITIDAS por folio o nombre de cliente para el buscador del
 * Flujo de caja. Devuelve la semana donde vive hoy (respetando override) para
 * que la grilla pueda "correrla" o navegar hacia ella. No aplica el filtro de
 * ventana: el objetivo es encontrar facturas que justamente NO están visibles.
 */
export async function searchDtesForFlow(
  tenantId: string,
  rawQuery: string,
  limit = 20,
): Promise<DteFlowSearchResult[]> {
  const q = rawQuery.trim();
  if (q.length === 0) return [];
  const asFolio = Number(q);
  const isFolio = Number.isInteger(asFolio) && asFolio > 0 && /^\d+$/.test(q);

  const dtes = await prisma.financeDte.findMany({
    where: {
      tenantId,
      direction: "ISSUED",
      siiStatus: { notIn: ["ANNULLED", "REJECTED"] },
      dteType: { notIn: [56, 61] },
      voidedByCreditNoteId: null,
      ...(isFolio
        ? { folio: asFolio }
        : { receiverName: { contains: q, mode: "insensitive" } }),
    },
    select: {
      id: true,
      folio: true,
      receiverName: true,
      totalAmount: true,
      date: true,
    },
    orderBy: { date: "desc" },
    take: limit,
  });
  if (dtes.length === 0) return [];

  const ids = dtes.map((d) => d.id);
  const [overrides, exclusions] = await Promise.all([
    prisma.financeCashflowDteDateOverride.findMany({
      where: { tenantId, dteId: { in: ids } },
      select: { dteId: true, customDate: true },
    }),
    prisma.financeCashflowDteFlowExclusion.findMany({
      where: { tenantId, dteId: { in: ids } },
      select: { dteId: true },
    }),
  ]);
  const overrideByDte = new Map(overrides.map((o) => [o.dteId, o.customDate]));
  const hiddenSet = new Set(exclusions.map((e) => e.dteId));

  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return dtes.map((d) => {
    const placement = overrideByDte.get(d.id) ?? d.date;
    const bounds = bucketBoundsFor(placement, "weekly");
    return {
      dteId: d.id,
      folio: d.folio,
      receiverName: d.receiverName,
      totalAmount: Number(d.totalAmount),
      emissionDate: iso(d.date),
      placementDate: iso(placement),
      weekKey: bucketKeyFor(placement, "weekly"),
      weekLabel: bounds.label,
      hiddenFromFlow: hiddenSet.has(d.id),
    };
  });
}
