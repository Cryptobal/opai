/**
 * Geometría de la hoja por CSS variables (--plnx-*, definidas en globals.css
 * bajo .planilla-sheet). Desktop: fila 20px (estándar), concepto 200px,
 * semana 86px, gutter 38px. Teléfonos: gutter 28px, concepto 100px, 4 semanas
 * exactas y fila dinámica clamp(15–20px).
 */
import type { FlowMatrixRowDto } from "@/modules/finance/flow-v3/matrix-types";

export const COL_W =
  "w-[var(--plnx-week-w)] min-w-[var(--plnx-week-w)] max-w-[var(--plnx-week-w)]";
export const NAME_W =
  "w-[var(--plnx-name-w)] min-w-[var(--plnx-name-w)] max-w-[var(--plnx-name-w)]";
/** Gutter fijo con números de fila (como una planilla). */
export const GUTTER_W =
  "w-[var(--plnx-gutter-w)] min-w-[var(--plnx-gutter-w)] max-w-[var(--plnx-gutter-w)]";
export const ROW_H = "h-[var(--plnx-row-h)]";
export const SECTION_H = "h-[var(--plnx-section-h)]";

/** Offset sticky de la columna Concepto (a la derecha del gutter). */
export const NAME_LEFT = "left-[var(--plnx-gutter-w)]";

/** Celda del gutter: número de fila, sticky izquierda, tinte de encabezado. */
export const GUTTER_CELL =
  "sticky left-0 border-b border-r border-ds-border-subtle/60 bg-ds-surface-2 px-0 text-center align-middle font-sans font-normal tabular-nums leading-none text-ds-text-4";

export const CELL_BASE =
  "relative px-1.5 max-md:px-[3px] text-right align-middle border-b border-r border-ds-border-subtle/60 overflow-hidden whitespace-nowrap";

/** Borde vertical primary de la columna de la semana actual (línea HOY). */
export const TODAY_COL = "border-l-2 border-l-primary";

/**
 * Sistema de 5 estados de celda (§5F). Con chips OFF la lectura es por marca
 * de esquina; con chips ON se conservan fondos tintados + chip de texto.
 *   fondo relleno         = el documento EXISTE (real / factura / proforma-EP);
 *   sin fondo + borde izq. = PROYECCIÓN (programada / borrador).
 */

/** REAL (conciliado): fondo teal + borde inferior sólido. */
export const REAL_CELL =
  "bg-status-ok-soft/60 border-b-status-ok-border";

/** FACTURA EMITIDA (folio): documento azul, fondo relleno + borde sólido. */
export const COMMITTED_DTE_CELL =
  "bg-status-info-soft/60 border-b-status-info-border";

/** PROGRAMADA (cuota aún sin documento): proyección azul, sin fondo + borde
 *  izquierdo punteado. */
export const COMMITTED_SCHEDULED_CELL =
  "border-l-2 border-l-status-info-border [border-left-style:dotted]";

/** PROFORMA / EP enviado: documento ámbar, fondo relleno + borde sólido. */
export const COMMITTED_PROFORMA_CELL =
  "bg-status-warn-soft/60 border-b-status-warn-border";

/** BORRADOR sin enviar: proyección ámbar, sin fondo + borde izquierdo punteado. */
export const COMMITTED_DRAFT_CELL =
  "border-l-2 border-l-status-warn-border [border-left-style:dotted]";

/**
 * Marca de esquina 6px (triángulo sup-der). Prioridad: real > dte/scheduled >
 * draft/proforma. Proyección P no lleva marca (monto atenuado).
 */
export const CORNER_REAL =
  "after:absolute after:right-0 after:top-0 after:h-0 after:w-0 after:border-l-[6px] after:border-t-[6px] after:border-l-transparent after:border-t-status-ok after:content-['']";
export const CORNER_DTE =
  "after:absolute after:right-0 after:top-0 after:h-0 after:w-0 after:border-l-[6px] after:border-t-[6px] after:border-l-transparent after:border-t-status-info after:content-['']";
export const CORNER_WARN =
  "after:absolute after:right-0 after:top-0 after:h-0 after:w-0 after:border-l-[6px] after:border-t-[6px] after:border-l-transparent after:border-t-status-warn after:content-['']";

/** Selección Sheets: borde azul + handle (ver globals.css `.planilla-selected`). */
export const SELECTED_CELL = "planilla-selected";

/** Header de columna/fila seleccionado (tinte azul Sheets / teal en noche). */
export const SELECTED_HDR = "bg-[hsl(var(--plnx-sel-hdr))]";

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

/**
 * Fila "en cero" durante el horizonte cargado: ninguna celda tiene capa
 * efectiva (ni plan, ni comprometido, ni real). Con "ocultar ceros" activo
 * estas filas no se renderizan; las estructurales (secciones, resumen)
 * siempre permanecen.
 */
export function isZeroRow(row: Pick<FlowMatrixRowDto, "cells">): boolean {
  return row.cells.every((c) => c.layer === "empty");
}
