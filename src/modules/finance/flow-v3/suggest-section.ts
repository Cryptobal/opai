/**
 * Sugiere sección de planilla a partir de código/nombre de categoría.
 * Puro — usable en cliente y tests.
 */
import { CANONICAL_FLOW_ROWS } from "./canonical-rows";

export type SuggestableFlowSection =
  | "REMUNERACIONES"
  | "IMPUESTOS"
  | "GAV"
  | "FINANCIAMIENTO"
  | "OTROS";

function normalize(s: string): string {
  return s
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^A-Z0-9_]+/g, "_");
}

/**
 * Heurística para "Crear fila" desde categorías sin renglón.
 * Usa primero el catálogo canónico; luego patrones de código/nombre.
 * Default GAV (gastos de administración/ventas), nunca INGRESOS.
 */
export function suggestFlowSectionForCategory(
  code: string,
  name?: string | null,
): SuggestableFlowSection {
  const codeN = normalize(code);
  const nameN = normalize(name ?? "");
  const hay = `${codeN} ${nameN}`;

  const canonical = CANONICAL_FLOW_ROWS.find(
    (r) => r.categoryCode && normalize(r.categoryCode) === codeN,
  );
  if (
    canonical &&
    canonical.section !== "INGRESOS" &&
    canonical.section !== "OTROS"
  ) {
    return canonical.section;
  }
  if (canonical?.section === "OTROS") return "OTROS";

  if (
    codeN.startsWith("EGR_SUELDO") ||
    codeN.startsWith("EGR_QUINCENA") ||
    codeN.startsWith("EGR_PREVIRED") ||
    codeN.startsWith("EGR_TURNO") ||
    codeN.startsWith("EGR_FINIQUITO") ||
    /\b(SUELDO|QUINCENA|PREVIRED|FINIQUITO|TURNO_EXTRA|REMUNER)/.test(hay)
  ) {
    return "REMUNERACIONES";
  }

  if (
    codeN.startsWith("EGR_IVA") ||
    codeN.startsWith("EGR_IMPUESTO") ||
    /\b(IVA|F29|IMPUESTO|TGR|TESORERIA)\b/.test(hay) ||
    hay.includes("T_G_R") ||
    codeN.includes("TGR") ||
    nameN.includes("TGR")
  ) {
    return "IMPUESTOS";
  }

  if (
    /\b(SOCIO|FACTORING|PRESTAMO|CREDITO|FINANCI)/.test(hay) ||
    codeN.includes("SOCIO") ||
    codeN.includes("FACTORING") ||
    codeN.includes("PRESTAMO")
  ) {
    return "FINANCIAMIENTO";
  }

  return "GAV";
}
