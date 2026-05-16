import type {
  ProjectionRow,
  ProjectionRowItemDetail,
} from "@/modules/finance/cashflow/types";

/**
 * Tokeniza un término de búsqueda en palabras minúscula. Vacío si el
 * término es null / whitespace.
 */
function parseWords(term: string): string[] {
  return term
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Construye el haystack de un item (concat lowercase de los campos
 * relevantes). Memoización innecesaria — el filtro corre solo cuando
 * cambia searchTerm o la proyección.
 */
function itemHaystack(it: ProjectionRowItemDetail): string {
  return [
    it.itemName ?? "",
    it.nickname ?? "",
    it.crmAccountName ?? "",
    it.installationName ?? "",
  ]
    .join(" ")
    .toLowerCase();
}

function categoryHaystack(row: ProjectionRow): string {
  return [row.categoryCode ?? "", row.categoryName ?? ""]
    .join(" ")
    .toLowerCase();
}

/**
 * True si la fila pasa el filtro a nivel "categoría o algún item".
 * Útil cuando solo se necesita decidir si la fila aparece, pero NO
 * se filtra el contenido (kept for backward compat).
 */
export function rowMatchesSearch(row: ProjectionRow, term: string): boolean {
  const words = parseWords(term);
  if (words.length === 0) return true;
  const haystack =
    categoryHaystack(row) +
    " " +
    (row.items ?? []).map(itemHaystack).join(" ");
  return words.every((w) => haystack.includes(w));
}

/**
 * Bloque 6 Fase 4 (refinada). Filtra row + sus items según el término.
 *
 * Reglas:
 *  - Si term es vacío → devuelve el row tal cual (passthrough).
 *  - Si la categoría matchea por sí misma (categoryCode/Name contiene
 *    todas las palabras) → devuelve row con TODOS sus items (ej. al
 *    buscar "ventas" se quiere ver toda la categoría "Ventas por
 *    contrato").
 *  - Si la categoría no matchea, filtramos `row.items` por
 *    itemName/nickname/crmAccountName/installationName.
 *    - Buscar "polpaico" → matchea por crmAccountName en cada item del
 *      cliente → todos los items de Polpaico pasan naturalmente.
 *    - Buscar "el bosque" → solo matchea por installationName del
 *      contrato de El Bosque → ese único item pasa.
 *  - Si no quedan items, devuelve null (la fila se omite del render).
 *  - Si quedan items, recalculamos `values` (suma por bucket) y `total`
 *    desde los items filtrados, para que el header de la fila y el
 *    subtotal de la sección reflejen solo lo visible.
 */
export function filterRowBySearch(
  row: ProjectionRow,
  term: string,
): ProjectionRow | null {
  const words = parseWords(term);
  if (words.length === 0) return row;

  const categoryStr = categoryHaystack(row);
  const categoryMatches = words.every((w) => categoryStr.includes(w));
  if (categoryMatches) return row;

  const filteredItems = (row.items ?? []).filter((it) => {
    const hay = itemHaystack(it);
    return words.every((w) => hay.includes(w));
  });
  if (filteredItems.length === 0) return null;

  // Recalcular values por bucket sumando los items filtrados. Preserva
  // los campos extra del bucket-value original (actualAmount, etc.) del
  // bucket-value que tenía el row, ya que sumarlos no aplica para
  // actualAmount/cellStatus (esos son atributos de celda agregados).
  // Para fidelidad simple: solo sobrescribimos `amount`, dejando el
  // resto intacto. Cuando hay filtro activo, las celdas del agregado
  // de la fila siguen mostrando el actual real del bucket (no del
  // subset filtrado) — eso es razonable porque el actual es del banco.
  const filteredValues = (row.values ?? []).map((bv) => {
    const amount = filteredItems.reduce((sum, it) => {
      const v = it.values.find((iv) => iv.bucketKey === bv.bucketKey);
      return sum + (v?.amount ?? 0);
    }, 0);
    return { ...bv, amount };
  });

  const filteredTotal = filteredItems.reduce((sum, it) => sum + it.total, 0);

  return {
    ...row,
    items: filteredItems,
    values: filteredValues,
    total: filteredTotal,
  };
}
