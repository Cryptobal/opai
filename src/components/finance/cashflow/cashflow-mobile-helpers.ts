import type {
  ProjectionMatrix,
  ProjectionBucket,
  FinanceCashflowItemSource,
} from "@/modules/finance/cashflow/types";

const MONTH_SHORT = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];
const MONTH_LONG = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export const SOURCE_BADGE: Record<FinanceCashflowItemSource, string | null> = {
  MANUAL: null,
  CONTRACT: "Contrato",
  PAYROLL: "Sueldos",
  PAYROLL_LIQUIDO: "Líquido",
  PAYROLL_PREVIRED: "PreviRed",
  RECURRING_DTE: "DTE recurrente",
  SUPPLIER: "Proveedor",
  IVA: "F29",
  TURNOS_EXTRA: "TE",
  QUINCENA: "Quincena",
  RETIRO_SOCIO: "Retiro socio",
  AJUSTE: "Ajuste",
  OTHER: null,
};

// Prefix dedicado al mobile para no interferir con `cashflow.expanded.` del
// desktop (ExpandableMatrixRow), que mantiene default = colapsado. En móvil
// la pantalla es vertical y el usuario espera ver TODOS los ítems de una sin
// tener que abrir cada categoría una por una, así que default = expandido y
// solo persistimos la desviación (colapsado).
const STORAGE_PREFIX = "cashflow.mobile.expanded.";

export function getStoredExpanded(categoryId: string | null): boolean {
  if (typeof window === "undefined" || !categoryId) return true;
  try {
    return window.localStorage.getItem(STORAGE_PREFIX + categoryId) !== "0";
  } catch {
    return true;
  }
}

export function setStoredExpanded(
  categoryId: string | null,
  expanded: boolean,
) {
  if (typeof window === "undefined" || !categoryId) return;
  try {
    if (expanded) window.localStorage.removeItem(STORAGE_PREFIX + categoryId);
    else window.localStorage.setItem(STORAGE_PREFIX + categoryId, "0");
  } catch {
    // ignore
  }
}

/**
 * Etiqueta larga para el header del bucket activo.
 *  - weekly: "Semana del 12 al 18 may"
 *  - monthly: "Mayo 2026"
 */
export function getBucketDisplayLabel(
  b: ProjectionBucket,
  granularity: "weekly" | "monthly",
): string {
  if (granularity === "monthly") {
    return `${MONTH_LONG[b.start.getMonth()]} ${b.start.getFullYear()}`;
  }
  const startMonth = MONTH_SHORT[b.start.getMonth()];
  const endMonth = MONTH_SHORT[b.end.getMonth()];
  if (b.start.getMonth() === b.end.getMonth()) {
    return `Semana del ${b.start.getDate()} al ${b.end.getDate()} ${startMonth}`;
  }
  return `Sem ${b.start.getDate()} ${startMonth} – ${b.end.getDate()} ${endMonth}`;
}

/** Etiqueta corta para el chip horizontal. */
export function getChipLabel(
  b: ProjectionBucket,
  granularity: "weekly" | "monthly",
): string {
  if (granularity === "monthly") {
    return `${MONTH_SHORT[b.start.getMonth()]} '${String(b.start.getFullYear()).slice(-2)}`;
  }
  return b.label;
}

/**
 * Rehidrata las fechas serializadas que vienen del Server Component. El
 * `JSON.parse(JSON.stringify(projection))` convierte `start`/`end` en strings.
 */
export function hydrateProjection(p: ProjectionMatrix): ProjectionMatrix {
  return {
    ...p,
    buckets: p.buckets.map((b) => ({
      ...b,
      start: new Date(b.start as unknown as string),
      end: new Date(b.end as unknown as string),
    })),
  };
}
