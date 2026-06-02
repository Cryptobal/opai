/**
 * Constantes compartidas del módulo DTEs Emitidos.
 *
 * Extraídas de FacturacionClient.tsx para que múltiples componentes las usen
 * sin duplicar. RecibidosTab también las consume.
 */

import type { TagVariant } from "@/components/opai-ds";
import type { DteSortKey } from "./types";

export const DTE_TYPE_LABELS: Record<number, string> = {
  33: "Factura Electrónica",
  34: "Factura Exenta",
  39: "Boleta Electrónica",
  52: "Guía de Despacho",
  56: "Nota de Débito",
  61: "Nota de Crédito",
};

/** Etiqueta corta para badges en filas (mejor para mobile + densidad). */
export const DTE_TYPE_SHORT_LABELS: Record<number, string> = {
  33: "Factura",
  34: "F. Exenta",
  39: "Boleta",
  52: "G. Despacho",
  56: "N. Débito",
  61: "N. Crédito",
};

/**
 * Variant de Tag (DS v3) por tipo de DTE.
 *   33 (Factura)        → "brand"  (default azul OPAI)
 *   34 (Factura Exenta) → "info"
 *   39 (Boleta)         → "ok"
 *   52 (G. Despacho)    → "neutral"
 *   56 (Nota Débito)    → "warn"
 *   61 (Nota Crédito)   → "danger"
 */
export const DTE_TYPE_TAG_VARIANT: Record<number, TagVariant> = {
  33: "brand",
  34: "info",
  39: "ok",
  52: "neutral",
  56: "warn",
  61: "danger",
};

export const SII_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  DRAFT: { label: "Borrador", className: "bg-violet-500/15 text-violet-400 border-violet-500/30" },
  PENDING: { label: "Pendiente", className: "bg-status-warn-soft text-status-warn-fg border-status-warn-border" },
  ACCEPTED: { label: "Aceptado", className: "bg-status-ok-soft text-status-ok-fg border-status-ok-border" },
  REJECTED: { label: "Rechazado", className: "bg-status-danger-soft text-status-danger-fg border-status-danger-border" },
  ANNULLED: { label: "Anulado", className: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30" },
};

export const fmtCLP = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  minimumFractionDigits: 0,
});

/**
 * Formato compacto para montos grandes (mobile cards). Renderiza
 * `$10,3 M` en vez de `$10.300.000` para que no se corte el texto en
 * pantallas angostas. Usa la misma localización es-CL.
 */
export const fmtCLPCompact = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  notation: "compact",
  maximumFractionDigits: 1,
});

/**
 * Formatea CLP con compact si supera el threshold (default 1M),
 * de lo contrario usa el formato completo. Sirve para mobile donde
 * el ancho es escaso pero queremos preservar precisión en montos chicos.
 */
export function fmtCLPSmart(amount: number, threshold = 1_000_000): string {
  return Math.abs(amount) >= threshold
    ? fmtCLPCompact.format(amount)
    : fmtCLP.format(amount);
}

/**
 * Lista de períodos para los selectores de mes (DTEs Emit/Recib).
 * Formato value: "YYYY-MM". Label: "Mes Año" (ej: "Mayo 2026").
 * Devuelve los últimos N meses incluyendo el corriente.
 */
export function buildPeriodOptions(monthsBack = 36): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  const now = new Date();
  const mesNames = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
  ];
  for (let i = 0; i < monthsBack; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    out.push({
      value: `${y}-${String(m).padStart(2, "0")}`,
      label: `${mesNames[m - 1]} ${y}`,
    });
  }
  return out;
}

export const DTE_SORT_OPTIONS: { value: DteSortKey; label: string }[] = [
  { value: "date_desc", label: "Emisión: nuevo a antiguo" },
  { value: "date_asc", label: "Emisión: antiguo a nuevo" },
  { value: "created_desc", label: "Últimos ingresados" },
  { value: "created_asc", label: "Primeros ingresados" },
  { value: "total_desc", label: "Monto: mayor a menor" },
  { value: "total_asc", label: "Monto: menor a mayor" },
];

export function sortDteRows<
  T extends {
    date?: string;
    createdAt?: string;
    totalAmount: number;
    folio: number;
    dteType?: number;
  },
>(rows: T[], sort: DteSortKey): T[] {
  const value = (row: T) => {
    switch (sort) {
      case "created_desc":
      case "created_asc":
        return row.createdAt ? new Date(row.createdAt).getTime() : 0;
      case "total_desc":
      case "total_asc":
        return row.totalAmount;
      case "folio_desc":
      case "folio_asc":
        return row.folio;
      case "tipo_desc":
      case "tipo_asc":
        return row.dteType ?? 0;
      case "date_asc":
      case "date_desc":
      default:
        return row.date ? new Date(row.date).getTime() : 0;
    }
  };
  const direction = sort.endsWith("_asc") ? 1 : -1;
  return [...rows].sort((a, b) => {
    const diff = value(a) - value(b);
    if (diff !== 0) return diff * direction;
    return (a.folio - b.folio) * direction;
  });
}
