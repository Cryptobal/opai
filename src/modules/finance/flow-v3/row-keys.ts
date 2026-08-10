/**
 * Mapas canónicos FlowRowKey ↔ orígenes (payroll, hitos, categorías legacy).
 * Puro: sin prisma. Usado por matching, backfill y bootstrap.
 */
import type { FlowRowKey } from "@prisma/client";

/** categoryCode del módulo legacy → FlowRowKey (solo backfill / seed). */
export const CATEGORY_CODE_TO_ROW_KEY: Readonly<Record<string, FlowRowKey>> = {
  EGR_SUELDO: "SUELDO",
  EGR_QUINCENA: "QUINCENA",
  EGR_PREVIRED: "PREVIRED",
  EGR_TURNO_EXTRA: "TURNO_EXTRA",
  EGR_FINIQUITO: "FINIQUITO",
  EGR_IVA_F29: "IVA_F29",
  EGR_IMPUESTO: "OTRO_IMPUESTO",
  EGR_FACTORING: "FACTORING",
  EGR_RETIRO_SOCIO: "RETIRO_SOCIO",
  EGR_DEVOL_PRESTAMO_SOCIO: "DEVOL_PRESTAMO_SOCIO",
  ING_PRESTAMO_SOCIO: "APORTE_SOCIO",
};

/** FinanceLinkTarget payroll/TE → FlowRowKey. */
export const PAYROLL_LINK_KEY: Readonly<Record<string, FlowRowKey>> = {
  PAYROLL_LIQUIDACION: "SUELDO",
  PAYROLL_ANTICIPO: "QUINCENA",
  TE_LOTE: "TURNO_EXTRA",
  TE_ITEM: "TURNO_EXTRA",
  TE_TURNO: "TURNO_EXTRA",
};

/** Claves de hito de egreso → FlowRowKey. */
export const MILESTONE_ROW_KEY: Readonly<
  Record<string, FlowRowKey | null>
> = {
  liquido: "SUELDO",
  quincena: "QUINCENA",
  previred: "PREVIRED",
  impuesto_unico: "IVA_F29",
  f29: "IVA_F29",
  turnos_extra: "TURNO_EXTRA",
  retiro_socio: "RETIRO_SOCIO",
  finiquitos: "FINIQUITO",
  pct_sales: null,
};

/** Llaves de sistema que no deben reasignarse libremente desde UI. */
export const SYSTEM_ROW_KEYS: ReadonlySet<FlowRowKey> = new Set([
  "BANDEJA_INGRESO",
  "BANDEJA_EGRESO",
  "SUELDO",
  "QUINCENA",
  "PREVIRED",
  "TURNO_EXTRA",
  "FINIQUITO",
  "IVA_F29",
  "FACTORING",
  "RETIRO_SOCIO",
  "DEVOL_PRESTAMO_SOCIO",
  "APORTE_SOCIO",
  "CREDITO",
]);

/** Llaves de egreso (no válidas en secciones INGRESOS/OTROS ni bandejas). */
export const EXPENSE_ROW_KEYS: ReadonlySet<FlowRowKey> = new Set([
  "BANDEJA_EGRESO",
  "SUELDO",
  "QUINCENA",
  "PREVIRED",
  "TURNO_EXTRA",
  "FINIQUITO",
  "IVA_F29",
  "OTRO_IMPUESTO",
  "FACTORING",
  "RETIRO_SOCIO",
  "DEVOL_PRESTAMO_SOCIO",
  "CREDITO",
]);

export function isBandejaKey(key: FlowRowKey | null | undefined): boolean {
  return key === "BANDEJA_INGRESO" || key === "BANDEJA_EGRESO";
}

/** Normaliza nombre de fila para matching de backfill (una sola pasada). */
export function normalizeRowNameForKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

/**
 * Deriva FlowRowKey desde nombre normalizado (bandejas + filas sin categoryCode).
 * Solo para backfill; el matching en runtime usa canonicalKey.
 */
export function rowKeyFromNormalizedName(
  normalized: string,
  section: string,
): FlowRowKey | null {
  if (
    section === "INGRESOS" &&
    (normalized === "otros ingresos" || normalized === "otros clientes")
  ) {
    return "BANDEJA_INGRESO";
  }
  if (
    section === "GAV" &&
    (normalized === "otros egresos" || normalized === "otros gastos")
  ) {
    return "BANDEJA_EGRESO";
  }
  if (normalized === "aporte socios" || normalized === "aporte socio") {
    return "APORTE_SOCIO";
  }
  if (
    normalized === "creditos / financiamiento" ||
    normalized === "credito / financiamiento" ||
    normalized === "creditos" ||
    normalized === "credito"
  ) {
    return "CREDITO";
  }
  return null;
}
