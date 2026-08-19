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
  "relative px-1.5 max-md:px-[3px] text-right align-middle border-b border-r border-ds-border-subtle/60 overflow-hidden whitespace-nowrap hover:bg-ds-surface-2/70";

/** Borde vertical primary de la columna de la semana actual (línea HOY). */
export const TODAY_COL = "border-l-2 border-l-primary";

/**
 * Sistema de etapas de celda (modo fondo+chip, default).
 *   fondo relleno  = etapa fuerte (real / factura / cedida);
 *   sin fondo      = proyección (programada / borrador). EP y proforma NO
 *                    pintan la celda: van como iconos junto al monto.
 * Con chips OFF se conserva la lectura por marcas de esquina (legacy).
 */

/** REAL (conciliado): fondo teal + borde inferior sólido. */
export const REAL_CELL =
  "bg-status-ok-soft/60 border-b-status-ok-border";

/** FACTURA EMITIDA no pagada (folio): fondo azul + borde sólido. */
export const COMMITTED_DTE_CELL =
  "bg-status-info-soft/60 border-b-status-info-border";

/** FACTURA CEDIDA a factoring: fondo violeta (distinto de facturada/pagada). */
export const COMMITTED_CEDED_CELL =
  "bg-tint-violet/60 border-b border-b-tint-violet-fg/40";

/** PROGRAMADA (cuota aún sin documento): proyección, sin fondo + borde
 *  izquierdo punteado. */
export const COMMITTED_SCHEDULED_CELL =
  "border-l-2 border-l-status-info-border [border-left-style:dotted]";

/**
 * @deprecated Solo modo cuñas / leyenda legacy. En modo chips, EP/proforma
 * no rellenan la celda (usan iconos). Mantener export por tests/leyenda.
 */
export const COMMITTED_PROFORMA_CELL =
  "bg-status-warn-soft/60 border-b-status-warn-border";

/** BORRADOR (con o sin EP/proforma): misma familia gris que programada —
 *  sin fondo + borde izquierdo punteado ámbar sutil. */
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
/** Plan manual (override): esquina primary sutil — el usuario escribió el monto. */
export const CORNER_PLAN =
  "after:absolute after:right-0 after:top-0 after:h-0 after:w-0 after:border-l-[6px] after:border-t-[6px] after:border-l-transparent after:border-t-primary after:content-['']";

/**
 * Indicador de nota (elemento real inf-izq). Área táctil ampliada vía
 * `::before` transparente; el punto visible es el propio span.
 */
export const NOTE_DOT_EL =
  "planilla-note-dot absolute bottom-0.5 left-0.5 z-[3] h-1.5 w-1.5 cursor-pointer rounded-full bg-status-info pointer-events-auto";

/**
 * Barra de ejecución (2,5 px al pie). Elemento real: ::after/::before ya
 * ocupados por esquina y nota. z-[1] bajo el punto de nota (z-[3]).
 */
export const EXEC_BAR =
  "pointer-events-none absolute bottom-0 left-0.5 right-0.5 z-[1] h-[2.5px] overflow-hidden rounded-sm bg-ds-border-strong/50";
/** Con nota: acorta a left-3 para no tapar el punto inf-izq. */
export const EXEC_BAR_WITH_NOTE =
  "pointer-events-none absolute bottom-0 left-3 right-0.5 z-[1] h-[2.5px] overflow-hidden rounded-sm bg-ds-border-strong/50";
export const EXEC_BAR_FILL = "block h-full rounded-sm bg-status-ok";
export const EXEC_BAR_OVER = "block h-full rounded-sm bg-status-warn";

/**
 * Marcas secundarias inf-der (triángulo 5px). Complementan la esquina
 * superior: cedida / proforma enviada / EP enviado. Se renderizan como
 * elementos (before/after ya ocupados por nota + esquina principal).
 */
export const SUB_CORNER_BASE =
  "block h-0 w-0 border-l-[5px] border-b-[5px] border-l-transparent";
export const SUB_CORNER_CEDED = `${SUB_CORNER_BASE} border-b-status-ok`;
export const SUB_CORNER_PROFORMA = `${SUB_CORNER_BASE} border-b-status-info`;
/** EP usa primary (teal) para no chocar con ámbar (arriba) ni azul (proforma). */
export const SUB_CORNER_EP = `${SUB_CORNER_BASE} border-b-primary`;

/** Factura emitida con mora leve (1–60 d): borde inferior ámbar sutil. */
export const OVERDUE_CELL =
  "border-b-2 border-b-status-warn-border/80";

/** Factura emitida con mora >60 d: fondo ámbar tenue + borde inferior sólido. */
export const OVERDUE_OVER60_CELL =
  "bg-status-warn-soft/35 border-b-2 border-b-status-warn-border";

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
