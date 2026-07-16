import type { ProjectionRow } from "@/modules/finance/cashflow/types";

/** Concepto elegible en el selector / type-ahead (F3). */
export interface ConceptOption {
  name: string;
  categoryId: string | null;
  /** Pista secundaria (cliente / categoría) para desambiguar. */
  hint?: string;
}

/**
 * Construye las opciones de concepto a partir de las filas reales del flujo,
 * filtradas por tipo (ingreso/egreso).
 *
 * Regla de INGRESOS: al flujo entran los DTE recurrentes (item soberano). El
 * `source=CONTRACT` es un duplicado del contrato — NO se ofrece como concepto
 * (evita listar "Contrato X" o "Ventas por Contrato"). Se listan:
 *   - los ítems/clientes reales de cada categoría (DTE recurrentes, manuales…),
 *   - o, si la categoría no tiene ítems propios, la categoría misma (buckets
 *     manuales tipo "Préstamo de socios", "Otros ingresos").
 * Prefiere el ítem sobre la etiqueta de categoría para no duplicar ("DTE
 * Recurrente" + sus clientes). Los egresos no tienen el problema de CONTRACT.
 *
 * Extraído de ManualEntryQuickAdd (F2) — F3 lo consume en AddConceptRow.
 */
export function buildConceptOptions(
  rows: ProjectionRow[],
  kind: "INCOME" | "EXPENSE",
): ConceptOption[] {
  const seen = new Set<string>();
  const out: ConceptOption[] = [];
  const push = (name: string, categoryId: string | null, hint?: string) => {
    const nm = name.trim();
    if (!nm) return;
    const key = nm.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ name: nm, categoryId, hint: hint?.trim() || undefined });
  };

  for (const row of rows) {
    if (row.kind !== kind) continue;
    const items = row.items ?? [];
    const usable =
      kind === "INCOME" ? items.filter((i) => i.source !== "CONTRACT") : items;
    if (kind === "INCOME" && items.length > 0 && usable.length === 0) continue;

    if (usable.length > 0) {
      for (const it of usable) {
        push(
          it.itemName || "",
          row.categoryId,
          it.crmAccountName || row.categoryName || undefined,
        );
      }
    } else {
      push(row.categoryName || "", row.categoryId);
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, "es"));
}
