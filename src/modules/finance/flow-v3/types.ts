/**
 * Tipos compartidos de los derivadores del Flujo v3.
 *
 * Convención de signos: todos los montos de celdas son MAGNITUDES POSITIVAS
 * (bruto CLP), salvo el plan de FINANCIAMIENTO que es signado. El signo del
 * flujo lo pone la sección: INGRESOS y FINANCIAMIENTO suman, el resto resta.
 */

/** Documentos de cobro enviados asociados a un borrador. */
export interface SentDocs {
  proforma: boolean;
  estadoPago: boolean;
}

export interface CommittedItem {
  /** dte = factura EMITIDA · draft = borrador (aún sin folio) · scheduled =
   *  cuota programada todavía no generada. */
  kind: "dte" | "draft" | "scheduled";
  /** Solo kind=draft: proforma y/o estado de pago enviados al cliente. */
  sentDocs?: SentDocs;
  dteId?: string;
  templateId?: string;
  /** Solo kind=scheduled: período de la cuota/hito (YYYY-MM). */
  billingPeriod?: string;
  /** Solo kind=scheduled de egreso: hito payroll/F29 (quincena, liquido, …). */
  milestoneKey?: string;
  /// Solo hitos f29 / iva_postergado: período tributario YYYY-MM (mes de ventas).
  /// No confundir con billingPeriod, que es el mes de pago.
  taxPeriod?: string;
  folio?: number;
  /** Nombre visible: cliente/proveedor/hito (popover). */
  label: string;
  /** Fecha de anclaje en la celda (YYYY-MM-DD): emisión/doc u override. */
  fecha: string;
  /** CLP bruto (magnitud). */
  monto: number;
  /** Solo kind=scheduled|draft: término de la programación (null = sin término). */
  endDate?: string | null;
  /**
   * Término de pago del contrato en días, SOLO si está configurado
   * explícitamente en la programación. null/undefined = no mostrar.
   * Informativo: no desplaza la celda (v4.7).
   */
  terminoDias?: number | null;
  /** Fecha de emisión/documento (YYYY-MM-DD). Informativo en draft/scheduled. */
  issueYmd?: string;
  /**
   * Cobro estimado = issueYmd + terminoDias cuando el término está
   * configurado y > 0. Informativo; no ubica la celda.
   */
  cobroEstYmd?: string | null;
  /** true si la fecha de cobro venció hace más de 60 días (cartera zombie). */
  overdueOver60?: boolean;
  /** Días de atraso contractual (0 = al día). Solo kind=dte. */
  overdueDays?: number;
  /** Solo kind=dte: fecha de emisión SII (YYYY-MM-DD). */
  emissionYmd?: string;
  /** Solo kind=dte: fecha de vencimiento contractual (YYYY-MM-DD). */
  dueYmd?: string;
  /**
   * Solo kind=dte: factura cedida a factoring (derivado: cededPct > 0).
   * Conservado para secondaryMarks / menús legacy.
   */
  ceded?: boolean;
  /** Porcentaje cedido (0–100). Ausente o 0 = no cedida. */
  cededPct?: number;
  factorName?: string | null;
  /** Anticipo conciliado (operación FUNDED/COLLECTED). */
  factoringFunded?: boolean;
  /** Fecha estimada de liquidación de cesión/retención (YYYY-MM-DD). */
  cesionDueYmd?: string | null;
  /** Término de pago en días (informativo en ficha). */
  termDays?: number | null;
  /** Origen del término: contrato / tenant / explícito / default. */
  termSource?: "explicit" | "contrato" | "tenant" | "default";
  /** Fila de retención comercial de una cesión partida (ej. "Cliente 20%"). */
  isCededRetention?: boolean;
  /** Solo kind=dte: cuenta CRM del receptor (para cobranza multicanal). */
  crmAccountId?: string | null;
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
  /** DTE vinculado estaba cedido a factoring (marca secundaria en celda real). */
  ceded?: boolean;
}

export interface RealCell {
  total: number;
  items: RealItem[];
}

export type RealByRow = Map<string, Map<string, RealCell>>;

/**
 * Sentinel histórico de ingresos sin fila. En REAL ya no se autollena
 * (Otros ingresos es manual); en committed solo si `bandejaIncomeBankOnly`
 * está off. Se mantiene para remap de sentinels / tests.
 */
export const UNMATCHED_INCOME_KEY = "__unmatched_income__";
/** Egresos sin fila/categoría → fila fallback "Otros egresos". */
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
  /** @deprecated Preferir canonicalKey + accountPlanIds. Espejo legacy. */
  categoryId: string | null;
  /** Llave canónica (payroll/F29/bandejas). */
  canonicalKey?: string | null;
  /** Cuentas contables del renglón (para índices locales en tests). */
  accountPlanIds?: string[];
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
 * Solo alimenta "vencida hace N días" de emitidas sin dueDate (v4.7).
 * Ya NO desplaza celdas de cuotas ni borradores.
 */
export const DEFAULT_COLLECTION_LAG_DAYS = 30;

/**
 * Campos informativos de término de pago. Solo cuando la programación tiene
 * `diasCobro` explícito. Con 0 días no se expone cobroEst (redundante con emisión).
 */
export function terminoInfo(
  issueYmd: string,
  diasCobro: number | null | undefined,
): { issueYmd: string; terminoDias: number | null; cobroEstYmd: string | null } {
  if (diasCobro == null) {
    return { issueYmd, terminoDias: null, cobroEstYmd: null };
  }
  if (diasCobro === 0) {
    return { issueYmd, terminoDias: 0, cobroEstYmd: null };
  }
  return {
    issueYmd,
    terminoDias: diasCobro,
    cobroEstYmd: addDaysYmd(issueYmd, diasCobro),
  };
}
