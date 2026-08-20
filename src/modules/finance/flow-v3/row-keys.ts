/**
 * Mapas canónicos FlowRowKey ↔ orígenes (payroll, hitos, categorías legacy).
 * Puro: sin prisma. Usado por matching, backfill y bootstrap.
 */
import type { FlowRowKey } from "@prisma/client";
import type { PersonaLaborClass } from "@/lib/personas-staff";

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

/** FinanceLinkTarget payroll/TE → FlowRowKey preferida (hijo operativo). */
export const PAYROLL_LINK_KEY: Readonly<Record<string, FlowRowKey>> = {
  PAYROLL_LIQUIDACION: "SUELDO_OPERATIVO",
  PAYROLL_ANTICIPO: "QUINCENA_OPERATIVO",
  TE_LOTE: "TURNO_EXTRA",
  TE_ITEM: "TURNO_EXTRA",
  TE_TURNO: "TURNO_EXTRA",
};

/** Si el hijo canónico aún no existe en la planilla, caer al padre. */
export const PAYROLL_LINK_FALLBACK_KEY: Readonly<Partial<Record<FlowRowKey, FlowRowKey>>> = {
  SUELDO_OPERATIVO: "SUELDO",
  SUELDO_ADMIN: "SUELDO",
  QUINCENA_OPERATIVO: "QUINCENA",
  QUINCENA_ADMIN: "QUINCENA",
  PREVIRED_OPERATIVO: "PREVIRED",
  PREVIRED_ADMIN: "PREVIRED",
};

/** Claves de hito de egreso → fila padre (rollup). Preferir hijos vía milestonePayrollKeys. */
export const MILESTONE_ROW_KEY: Readonly<
  Record<string, FlowRowKey | null>
> = {
  liquido: "SUELDO",
  quincena: "QUINCENA",
  previred: "PREVIRED",
  impuesto_unico: "IVA_F29",
  f29: "IVA_F29",
  iva_postergado: "IVA_POSTERGADO",
  turnos_extra: "TURNO_EXTRA",
  retiro_socio: "RETIRO_SOCIO",
  finiquitos: "FINIQUITO",
  pct_sales: null,
};

export const PAYROLL_PARENT_KEYS: ReadonlySet<FlowRowKey> = new Set([
  "SUELDO",
  "QUINCENA",
  "PREVIRED",
]);

export const PAYROLL_CHILD_KEYS: ReadonlyArray<{
  parent: FlowRowKey;
  operativo: FlowRowKey;
  admin: FlowRowKey;
  milestoneKey: "liquido" | "quincena" | "previred";
}> = [
  { parent: "SUELDO", operativo: "SUELDO_OPERATIVO", admin: "SUELDO_ADMIN", milestoneKey: "liquido" },
  { parent: "QUINCENA", operativo: "QUINCENA_OPERATIVO", admin: "QUINCENA_ADMIN", milestoneKey: "quincena" },
  { parent: "PREVIRED", operativo: "PREVIRED_OPERATIVO", admin: "PREVIRED_ADMIN", milestoneKey: "previred" },
];

/** Cuentas del plan Chile para cada hijo de remuneraciones. */
export const PAYROLL_CHILD_ACCOUNT_CODES: Readonly<Partial<Record<FlowRowKey, readonly string[]>>> = {
  SUELDO_OPERATIVO: ["5.1.01.001"],
  QUINCENA_OPERATIVO: ["5.1.01.001"],
  PREVIRED_OPERATIVO: ["5.1.01.002"],
  SUELDO_ADMIN: ["6.1.01.001"],
  QUINCENA_ADMIN: ["6.1.01.001"],
  PREVIRED_ADMIN: ["6.1.01.002"],
};

export function payrollChildKeyForClass(
  milestoneKey: string,
  laborClass: PersonaLaborClass = "OPERATIVO",
): FlowRowKey | null {
  const row = PAYROLL_CHILD_KEYS.find((c) => c.milestoneKey === milestoneKey);
  if (!row) return null;
  return laborClass === "ADMINISTRATIVO" ? row.admin : row.operativo;
}

/** Preferido (hijo) + fallback (padre) para ruteo de hitos de nómina. */
export function milestonePayrollKeys(
  milestoneKey: string,
  laborClass: PersonaLaborClass = "OPERATIVO",
): FlowRowKey[] {
  const child = payrollChildKeyForClass(milestoneKey, laborClass);
  const parent = MILESTONE_ROW_KEY[milestoneKey];
  const out: FlowRowKey[] = [];
  if (child) out.push(child);
  if (parent) out.push(parent);
  return out;
}

export function payrollLinkKeys(targetType: string): FlowRowKey[] {
  const preferred = PAYROLL_LINK_KEY[targetType];
  if (!preferred) return [];
  const fallback = PAYROLL_LINK_FALLBACK_KEY[preferred];
  return fallback ? [preferred, fallback] : [preferred];
}

/** Llaves de sistema que no deben reasignarse libremente desde UI. */
export const SYSTEM_ROW_KEYS: ReadonlySet<FlowRowKey> = new Set([
  "BANDEJA_INGRESO",
  "BANDEJA_EGRESO",
  "SUELDO",
  "SUELDO_OPERATIVO",
  "SUELDO_ADMIN",
  "QUINCENA",
  "QUINCENA_OPERATIVO",
  "QUINCENA_ADMIN",
  "PREVIRED",
  "PREVIRED_OPERATIVO",
  "PREVIRED_ADMIN",
  "TURNO_EXTRA",
  "FINIQUITO",
  "IVA_F29",
  "IVA_POSTERGADO",
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
  "SUELDO_OPERATIVO",
  "SUELDO_ADMIN",
  "QUINCENA",
  "QUINCENA_OPERATIVO",
  "QUINCENA_ADMIN",
  "PREVIRED",
  "PREVIRED_OPERATIVO",
  "PREVIRED_ADMIN",
  "TURNO_EXTRA",
  "FINIQUITO",
  "IVA_F29",
  "IVA_POSTERGADO",
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
