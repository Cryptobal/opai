/**
 * Filas canónicas de la planilla (compartidas por el auto-bootstrap y el
 * script de import). Archivo puro, sin prisma.
 */
export interface CanonicalFlowRow {
  section: "INGRESOS" | "REMUNERACIONES" | "IMPUESTOS" | "GAV" | "FINANCIAMIENTO" | "OTROS";
  name: string;
  /** Categoría del módulo viejo a la que se mapea si el tenant la tiene. */
  categoryCode: string | null;
}

export const CANONICAL_FLOW_ROWS: CanonicalFlowRow[] = [
  { section: "INGRESOS", name: "Otros clientes", categoryCode: null },
  { section: "REMUNERACIONES", name: "Sueldos líquidos", categoryCode: "EGR_SUELDO" },
  { section: "REMUNERACIONES", name: "Quincena (anticipos)", categoryCode: "EGR_QUINCENA" },
  { section: "REMUNERACIONES", name: "Imposiciones (Previred)", categoryCode: "EGR_PREVIRED" },
  { section: "REMUNERACIONES", name: "Turnos extra", categoryCode: "EGR_TURNO_EXTRA" },
  { section: "IMPUESTOS", name: "IVA F29", categoryCode: "EGR_IVA_F29" },
  { section: "GAV", name: "Otros gastos", categoryCode: null },
  { section: "FINANCIAMIENTO", name: "Créditos / financiamiento", categoryCode: null },
];
