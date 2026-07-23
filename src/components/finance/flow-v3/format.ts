/**
 * Formato numérico de la planilla (es-CL, CLP entero). Reusa el parseo de
 * miles del grid v2 (amount-format) agregando soporte de signo, que la v2 no
 * necesitaba y la planilla sí (FINANCIAMIENTO).
 */
import { formatThousands, parseAmount } from "@/components/finance/cashflow/v2/amount-format";

export { formatThousands };

/** "1.234.567" / "-1.234.567" → número signado. */
export function parseSignedAmount(formatted: string): number {
  const negative = formatted.trim().startsWith("-");
  const abs = parseAmount(formatted);
  return negative ? -abs : abs;
}

/** Número → "1.234.567" (sin símbolo $; la grilla es densa). */
export function fmtCell(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "";
  const abs = Math.round(Math.abs(value));
  const s = abs.toLocaleString("es-CL");
  return value < 0 ? `-${s}` : s;
}

/** Número → "$1.234.567" para KPIs/popover. */
export function fmtClp(value: number): string {
  const abs = Math.round(Math.abs(value)).toLocaleString("es-CL");
  return `${value < 0 ? "-" : ""}$${abs}`;
}

/** "2026-07-20" → "20/07". */
export function fmtDayMonth(ymd: string): string {
  return `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;
}

/** "2026-07-20" → "20/07/26". */
export function fmtShortDate(ymd: string): string {
  return `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(2, 4)}`;
}

/** Clase tipográfica numérica de la grilla (11px mono tabular desktop; el
 *  uppercase/tracking cumple el patrón eyebrow del DS y es no-op sobre
 *  dígitos). En teléfonos sube a 12px (mínimo legible del DS) con leading
 *  compacto para las filas densas de 13–18px. */
export const NUM_CLASS =
  "font-mono uppercase tracking-tight tabular-nums text-[11px] max-md:text-[12px] leading-none";

/** Montos largos (≥ $10M con separadores) bajan a 11px mono-eyebrow SOLO en
 *  teléfonos para no recortar dígitos en celdas de ~65px (11px es el patrón
 *  aceptado por el DS para esta grilla densa). */
export function numSizeClass(formatted: string): string {
  return formatted.length >= 10
    ? "font-mono uppercase tracking-tighter max-md:text-[11px]"
    : "";
}
