/**
 * Qué tipos del plan de cuentas tiene sentido ofrecer al vincular un renglón
 * según la sección del flujo.
 */
export type FlowAccountOption = {
  id: string;
  label: string;
  type: string;
  code: string;
};

const SECTION_ACCOUNT_TYPES: Record<string, ReadonlySet<string>> = {
  REMUNERACIONES: new Set(["COST", "EXPENSE"]),
  GAV: new Set(["EXPENSE", "COST"]),
  IMPUESTOS: new Set(["LIABILITY", "EXPENSE"]),
  FINANCIAMIENTO: new Set(["LIABILITY", "EQUITY", "ASSET"]),
  OTROS: new Set(["EXPENSE", "COST", "LIABILITY", "ASSET"]),
};

export function accountTypesForFlowSection(section: string): ReadonlySet<string> | null {
  return SECTION_ACCOUNT_TYPES[section] ?? null;
}

export function filterAccountOptionsForSection(
  options: FlowAccountOption[],
  section: string,
): FlowAccountOption[] {
  const allowed = accountTypesForFlowSection(section);
  if (!allowed) return options;
  const filtered = options.filter((o) => allowed.has(o.type));
  // Si el plan no tiene cuentas del tipo esperado, no dejar el selector vacío.
  return filtered.length > 0 ? filtered : options;
}

export function accountHintForSection(section: string): string {
  switch (section) {
    case "GAV":
      return "Opcional. Elegí una cuenta de gasto (6.x). Podés dejarlo vacío y vincular después en Configuración → Renglones.";
    case "REMUNERACIONES":
      return "Opcional. Preferí cuentas de costo/gasto de personal (5.x / 6.x).";
    case "IMPUESTOS":
      return "Opcional. Preferí pasivos de impuestos (2.1.02.x), p.ej. IVA o TGR.";
    case "FINANCIAMIENTO":
      return "Opcional. Pasivos/patrimonio/activos de liquidez (préstamos, socios, fondos mutuos).";
    default:
      return "Opcional. Si no elegís ahora, vinculás la cuenta después en Configuración → Renglones.";
  }
}
