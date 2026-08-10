/**
 * Formato numérico de la planilla (es-CL, CLP entero). Reusa el parseo de
 * miles del grid v2 (amount-format) agregando soporte de signo, que la v2 no
 * necesitaba y la planilla sí (FINANCIAMIENTO).
 */
import { formatThousands, parseAmount } from "@/components/finance/cashflow/v2/amount-format";

export { formatThousands };

export type NumberFormatMode = "clp" | "m" | "mm";

/** "1.234.567" / "-1.234.567" → número signado. */
export function parseSignedAmount(formatted: string): number {
  const negative = formatted.trim().startsWith("-");
  const abs = parseAmount(formatted);
  return negative ? -abs : abs;
}

/**
 * Número → texto de celda. Modo clp: "1.234.567"; m: miles redondeados;
 * mm: millones redondeados. Sin símbolo $ (la grilla es densa).
 */
export function fmtCell(value: number, mode: NumberFormatMode = "clp"): string {
  if (!Number.isFinite(value) || value === 0) return "";
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (mode === "m") {
    const scaled = Math.round(abs / 1_000);
    if (scaled === 0) return "";
    return `${sign}${scaled.toLocaleString("es-CL")}`;
  }
  if (mode === "mm") {
    const scaled = Math.round(abs / 1_000_000);
    if (scaled === 0) return "";
    return `${sign}${scaled.toLocaleString("es-CL")}`;
  }
  return `${sign}${Math.round(abs).toLocaleString("es-CL")}`;
}

/** Número → "$1.234.567" para KPIs/popover. */
export function fmtClp(value: number): string {
  const abs = Math.round(Math.abs(value)).toLocaleString("es-CL");
  return `${value < 0 ? "-" : ""}$${abs}`;
}

/**
 * Eje Y / chips densos: millones con 1 decimal (`$41,9M`), miles (`$820k`) o `$0`.
 * es-CL (coma decimal). No acumula redondeos parciales.
 */
export function fmtClpShort(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "$0";
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    const m = abs / 1_000_000;
    const text =
      m >= 100
        ? Math.round(m).toLocaleString("es-CL")
        : m.toLocaleString("es-CL", {
            minimumFractionDigits: 0,
            maximumFractionDigits: 1,
          });
    return `${sign}$${text}M`;
  }
  if (abs >= 1_000) {
    const k = Math.round(abs / 1_000);
    return `${sign}$${k.toLocaleString("es-CL")}k`;
  }
  return `${sign}$${Math.round(abs).toLocaleString("es-CL")}`;
}

/** "2026-07-20" → "20/07". */
export function fmtDayMonth(ymd: string): string {
  return `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;
}

/** "2026-07-20" → "20/07/26". */
export function fmtShortDate(ymd: string): string {
  return `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(2, 4)}`;
}

/**
 * Chip de folio para la celda: "F°1234". Si excede 6 caracteres (folio ≥ 5
 * dígitos) se trunca a "F°…34" y el `title` conserva el folio completo, para
 * que quepa en la celda densa sin perder trazabilidad.
 */
export function folioChip(folio: number): { text: string; title: string } {
  const full = `F°${folio}`;
  if (full.length <= 6) return { text: full, title: full };
  return { text: `F°…${String(folio).slice(-2)}`, title: full };
}

/**
 * Tipografía numérica de la grilla: sans proporcional del DS (Inter) con
 * tabular-nums, peso 400. El tamaño lo hereda del contenedor
 * (`--plnx-font * --plnx-zoom`). En móvil el mínimo legible del DS es 12px.
 */
export const NUM_CLASS =
  "font-sans font-normal tabular-nums leading-none max-md:text-[12px]";

/** Montos largos (≥ $10M con separadores) bajan tracking en móviles densos. */
export function numSizeClass(formatted: string): string {
  return formatted.length >= 10 ? "tracking-tighter max-md:text-[11px]" : "";
}
