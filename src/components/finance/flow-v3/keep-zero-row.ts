/**
 * Filas que deben seguir visibles con “Ocultar ceros” activo.
 * Canónicas (sueldos, IVA, socios…) y toda Financiamiento/Impuestos:
 * el usuario las espera en la planilla aunque estén en $0.
 */
export function keepZeroFlowRow(row: {
  id: string;
  section: string;
  mapping: string;
  canonicalKey?: string | null;
}): boolean {
  const key = row.canonicalKey ?? null;
  if (key === "BANDEJA_INGRESO" || key === "BANDEJA_EGRESO") return false;
  if (key) return true;
  if (row.section === "FINANCIAMIENTO" || row.section === "IMPUESTOS") {
    return true;
  }
  if (
    row.section !== "INGRESOS" &&
    (row.mapping === "ACCOUNTS" ||
      row.mapping === "CATEGORY" ||
      row.mapping === "MANUAL" ||
      row.mapping === "SUPPLIER")
  ) {
    // Remuneraciones / GAV configurados: visibles en cero para poder cargar plan.
    return row.section === "REMUNERACIONES" || row.section === "GAV";
  }
  return false;
}
