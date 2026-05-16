import type { ProjectionRow } from "@/modules/finance/cashflow/types";

/**
 * Filtra una fila por texto contra varios campos del row y de sus items.
 *
 * Una fila pasa si:
 *  - el nombre/código de la categoría matchea, O
 *  - alguno de sus items hijos matchea por:
 *      itemName, nickname, crmAccountName, installationName.
 *
 * Comparación case-insensitive, soporta múltiples palabras separadas
 * por espacio (AND de cada palabra contra el haystack completo).
 *
 * Bloque 6 Fase 4 — usado por WeeklyMatrix, MonthlyMatrix y
 * CashflowMobileList; el state vive en CashflowTabs para que el
 * filtro se preserve al cambiar entre vistas.
 */
export function rowMatchesSearch(row: ProjectionRow, term: string): boolean {
  const normalized = term.trim().toLowerCase();
  if (!normalized) return true;
  const words = normalized.split(/\s+/).filter(Boolean);

  const haystack = [
    row.categoryCode ?? "",
    row.categoryName ?? "",
    ...(row.items ?? []).flatMap((it) => [
      it.itemName ?? "",
      it.nickname ?? "",
      it.crmAccountName ?? "",
      it.installationName ?? "",
    ]),
  ]
    .join(" ")
    .toLowerCase();

  return words.every((w) => haystack.includes(w));
}
