import type {
  ProjectionBucket,
  VirtualOccurrence,
} from "@/modules/finance/cashflow/types";
import {
  pillVariantFor,
  type PillVariant,
} from "@/components/finance/cashflow/CellStatusPill";
import { isDraggableSource } from "./grid-helpers";
import { toDate } from "../format";

/** yyyy-MM-dd de una fecha (string ISO o Date) — identifica la occurrence al mover. */
export const ymd = (d: string | Date) => toDate(d).toISOString().slice(0, 10);

/**
 * Port de `filterShadowProjectionsWithDtePriority` (projection.service): dentro
 * de un bucket, si un item ya tiene una occurrence con DTE se descartan sus
 * proyecciones puras (dteId=null) de ESE item — la sombra. Así el conteo de
 * cuotas de la celda coincide con lo que la grilla realmente pinta.
 */
function dropShadowProjections(occs: VirtualOccurrence[]): VirtualOccurrence[] {
  const itemsWithDte = new Set<string>();
  for (const o of occs) if (o.itemId && o.dteId) itemsWithDte.add(o.itemId);
  if (!itemsWithDte.size) return occs;
  return occs.filter(
    (o) => !(o.itemId && !o.dteId && itemsWithDte.has(o.itemId)),
  );
}

/**
 * Port de `filterOccurrencesWithConciliationPriority`: la conciliación bancaria
 * reemplaza lo proyectado dentro de la celda (regla más fuerte). Sin
 * conciliación, se muestran todas (programación + borrador + emitida coexisten
 * y se suman — es correcto, ver regla de negocio).
 */
function visibleInCell(occs: VirtualOccurrence[]): VirtualOccurrence[] {
  const afterShadow = dropShadowProjections(occs);
  const hasConciliation = afterShadow.some((o) => o.bankTransactionId !== null);
  return hasConciliation
    ? afterShadow.filter((o) => o.bankTransactionId !== null)
    : afterShadow;
}

/**
 * ¿La cuota es movible? Una pagada/conciliada es fija y NO entra al selector.
 * Los egresos del sistema (source no arrastrable) tampoco. Solo entran
 * programación / borrador / emitida-no-pagada.
 */
export function isMovableOccurrence(o: VirtualOccurrence): boolean {
  if (o.cellStatus === "PAID" || o.status === "PAID") return false;
  if (o.bankTransactionId !== null) return false;
  return isDraggableSource(o.source);
}

/**
 * Cuotas movibles de una celda (item × bucket): occurrences visibles del item
 * en el bucket, excluidas las fijas (pagadas / conciliadas / de sistema).
 * La grilla la usa al soltar un arrastre para decidir si abre el selector
 * "¿cuál cuota mover?" (≥2) o mueve directo (≤1).
 */
export function movableOccurrencesInCell(
  bucket: ProjectionBucket,
  itemId: string | null,
): VirtualOccurrence[] {
  if (!itemId) return [];
  const inCell = bucket.occurrences.filter((o) => o.itemId === itemId);
  return visibleInCell(inCell).filter(isMovableOccurrence);
}

/** Variant (pill de color) de una occurrence individual para el selector. */
export function occurrenceVariant(o: VirtualOccurrence): PillVariant {
  return pillVariantFor({
    cellStatus: o.cellStatus ?? "PROJECTED",
    daysOverdue: o.daysOverdue,
    factoringCollected: o.factoringCollected,
  });
}
