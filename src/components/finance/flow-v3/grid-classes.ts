/**
 * Densidad Excel de la planilla (specs v3.1): fila 22px, numérica 11px mono
 * tabular, primera columna 200px, semanas 86px, padding-x 6px, headers de
 * sección 20px. Objetivo: ≥22 filas visibles en 1440×900.
 */
// Mobile (F4): 3 columnas de semana + primera columna angosta = 354px,
// cabe en 360px sin scroll horizontal; se navega con swipe.
export const COL_W =
  "w-[86px] min-w-[86px] max-w-[86px] max-md:w-[78px] max-md:min-w-[78px] max-md:max-w-[78px]";
export const NAME_W =
  "w-[200px] min-w-[200px] max-w-[200px] max-md:w-[120px] max-md:min-w-[120px] max-md:max-w-[120px]";
export const ROW_H = "h-[22px]";
export const SECTION_H = "h-[20px]";

export const CELL_BASE =
  "relative px-1.5 text-right align-middle border-b border-r border-ds-border-subtle/60";

/** Borde vertical primary de la columna de la semana actual (línea HOY). */
export const TODAY_COL = "border-l-2 border-l-primary";

/** Celda con capa REAL: fondo teal suave + punto (bloqueada). */
export const REAL_CELL =
  "bg-status-ok-soft/60 before:absolute before:left-[3px] before:top-1/2 before:-translate-y-1/2 before:h-[3px] before:w-[3px] before:rounded-full before:bg-primary/70 before:content-['']";

/** Celda con COMPROMETIDO: fondo info suave + borde inferior punteado. */
export const COMMITTED_CELL =
  "bg-status-info-soft/50 border-b-status-info-border [border-bottom-style:dotted]";

export const SELECTED_CELL = "outline outline-1 -outline-offset-1 outline-primary";

export const SECTION_LABELS: Record<string, string> = {
  INGRESOS: "Ingresos",
  REMUNERACIONES: "Remuneraciones",
  IMPUESTOS: "Impuestos",
  GAV: "GAV",
  FINANCIAMIENTO: "Financiamiento",
  OTROS: "Otros",
};

export const SECTION_ORDER = [
  "INGRESOS",
  "REMUNERACIONES",
  "IMPUESTOS",
  "GAV",
  "FINANCIAMIENTO",
  "OTROS",
];

/** Valor visible de una celda según sección (egresos en magnitud positiva;
 *  FINANCIAMIENTO signado; real viene cash-signed). */
export function displayValue(section: string, layer: string, raw: number): number {
  if (section === "FINANCIAMIENTO" || section === "INGRESOS") {
    return layer === "real" && section === "INGRESOS" ? Math.abs(raw) : raw;
  }
  return Math.abs(raw);
}
