/**
 * Tipos compartidos de los derivadores del Flujo v3.
 *
 * Convención de signos: todos los montos de celdas son MAGNITUDES POSITIVAS
 * (bruto CLP), salvo el plan de FINANCIAMIENTO que es signado. El signo del
 * flujo lo pone la sección: INGRESOS y FINANCIAMIENTO suman, el resto resta.
 */

export interface CommittedItem {
  /** dte = factura EMITIDA · draft = borrador (aún sin folio) · scheduled =
   *  cuota programada todavía no generada. */
  kind: "dte" | "draft" | "scheduled";
  /** Solo kind=draft: la proforma/estado de pago ya fue enviada al cliente. */
  proformaSent?: boolean;
  dteId?: string;
  templateId?: string;
  folio?: number;
  /** Nombre visible: cliente/proveedor/hito (popover). */
  label: string;
  /** Fecha estimada de cobro/pago (YYYY-MM-DD). */
  fecha: string;
  /** CLP bruto (magnitud). */
  monto: number;
  /** Solo kind=scheduled: término de la programación (null = sin término). */
  endDate?: string | null;
  /** Solo kind=scheduled: término de pago del contrato en días (null = default tenant). */
  diasCobro?: number | null;
  /** true si la fecha de cobro venció hace más de 60 días (cartera zombie). */
  overdueOver60?: boolean;
}

/** DTE excluido del flujo (solo capa planilla; ledger intacto). */
export interface FlowExcludedDte {
  dteId: string;
  folio: number | null;
  label: string;
  reason: string | null;
  createdAt: string;
  /** Fila de la planilla a la que pertenecería (post RUT fallback). */
  rowId: string;
}

export interface CommittedCell {
  total: number;
  items: CommittedItem[];
}

/** rowId (o UNMATCHED_*) → lunes ISO YYYY-MM-DD → celda. */
export type CommittedByRow = Map<string, Map<string, CommittedCell>>;

export interface RealItem {
  bankTransactionId: string;
  /** Folio del DTE conciliado, si el link apunta a uno. */
  folio?: number;
  dteId?: string;
  label: string;
  /** Fecha real del movimiento (YYYY-MM-DD). */
  fecha: string;
  /** CLP SIGNADO por dirección de caja: + abono / − cargo. */
  monto: number;
}

export interface RealCell {
  total: number;
  items: RealItem[];
}

export type RealByRow = Map<string, Map<string, RealCell>>;

/** Ingresos sin fila (cuenta sin fila propia) → fila fallback "Otros clientes". */
export const UNMATCHED_INCOME_KEY = "__unmatched_income__";
/** Egresos sin fila/categoría → fila fallback "Otros gastos". */
export const UNMATCHED_EXPENSE_KEY = "__unmatched_expense__";

/** Referencia mínima de fila para el match de derivadores. */
export interface FlowRowRef {
  id: string;
  name: string;
  section?: string;
  mapping?: string;
  crmAccountId: string | null;
  installationId: string | null;
  /** 1 fila = 1 programación; null en filas genéricas de cuenta/egreso. */
  recurringTemplateId?: string | null;
  categoryId: string | null;
  supplierId?: string | null;
}

export function pushCommitted(
  map: CommittedByRow,
  rowKey: string,
  weekYmd: string,
  item: CommittedItem,
): void {
  let byWeek = map.get(rowKey);
  if (!byWeek) {
    byWeek = new Map();
    map.set(rowKey, byWeek);
  }
  const cell = byWeek.get(weekYmd) ?? { total: 0, items: [] };
  cell.total += item.monto;
  cell.items.push(item);
  byWeek.set(weekYmd, cell);
}

export function pushReal(
  map: RealByRow,
  rowKey: string,
  weekYmd: string,
  item: RealItem,
): void {
  let byWeek = map.get(rowKey);
  if (!byWeek) {
    byWeek = new Map();
    map.set(rowKey, byWeek);
  }
  const cell = byWeek.get(weekYmd) ?? { total: 0, items: [] };
  cell.total += item.monto;
  cell.items.push(item);
  byWeek.set(weekYmd, cell);
}

/** Suma días a un YMD (UTC puro). */
export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

/**
 * Término de pago default cuando no hay dueDate ni término configurado.
 * Ni CrmAccount ni FinanceDteRecurringTemplate tienen término de pago en el
 * schema (ver AUDIT.md §3.1) — 30 días es el estándar B2B chileno.
 */
export const DEFAULT_COLLECTION_LAG_DAYS = 30;
