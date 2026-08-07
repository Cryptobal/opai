/**
 * Cálculo puro de mora accionable (flujo v3).
 *
 * Una factura emitida está en mora sii todas las condiciones de negocio
 * se cumplen. Cesiones (totales o parciales) y retenciones nunca generan mora.
 * Sin I/O — testeable sin BD.
 */

/** Estados de factoring que sacan la factura del circuito de cobranza. */
export const ACTIVE_CESSION_STATUSES = [
  "SUBMITTED",
  "APPROVED",
  "FUNDED",
  "COLLECTED",
  "CLOSED",
] as const;

/** Estados donde el anticipo ya está en banco (o cobrado al factor). */
export const FUNDED_CESSION_STATUSES = ["FUNDED", "COLLECTED"] as const;

export interface CessionInfo {
  active: boolean;
  /** Porcentaje anticipado (0–100). */
  pct: number;
  factorName: string | null;
  funded: boolean;
  /** Fecha estimada de liquidación YYYY-MM-DD (`fechaVencimiento`). */
  dueYmd: string | null;
}

export type DueDateSource = "explicit" | "contrato" | "tenant" | "default";

export interface OverdueInput {
  dueYmd: string | null;
  todayYmd: string;
  pendingClp: number;
  paymentStatus: string;
  cession: CessionInfo | null;
  reconciled: boolean;
  voided: boolean;
  isCededRetention: boolean;
}

/** Días calendarios UTC de `fromYmd` a `toYmd` (positivo si to > from). */
function daysBetweenYmd(fromYmd: string, toYmd: string): number {
  const a = Date.parse(`${fromYmd}T00:00:00Z`);
  const b = Date.parse(`${toYmd}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.floor((b - a) / 86_400_000);
}

/**
 * Mora accionable en días. 0 si no hay mora (incluye vence hoy).
 * Criterio estricto `hoy > dueDate` (igual que dte-overdue.service).
 */
export function computeOverdueDays(input: OverdueInput): number {
  if (!input.dueYmd) return 0;
  if (input.pendingClp <= 0) return 0;
  if (
    input.paymentStatus === "PAID" ||
    input.paymentStatus === "CEDED" ||
    input.paymentStatus === "WRITTEN_OFF"
  ) {
    return 0;
  }
  if (input.cession?.active) return 0;
  if (input.isCededRetention) return 0;
  if (input.reconciled) return 0;
  if (input.voided) return 0;
  const days = daysBetweenYmd(input.dueYmd, input.todayYmd);
  return days > 0 ? days : 0;
}

export interface FactoringOpForCession {
  status: string;
  advanceRate: number;
  factoringCompany: string;
  fechaVencimiento: Date | null;
}

/**
 * Colapsa N operaciones de un DTE en una sola CessionInfo.
 * Entre activas toma la de mayor advanceRate; si ninguna activa → null.
 */
export function resolveCession(
  ops: FactoringOpForCession[],
): CessionInfo | null {
  const active = ops.filter((o) =>
    (ACTIVE_CESSION_STATUSES as readonly string[]).includes(o.status),
  );
  if (active.length === 0) return null;
  let best = active[0]!;
  for (let i = 1; i < active.length; i++) {
    const o = active[i]!;
    if (Number(o.advanceRate) > Number(best.advanceRate)) best = o;
  }
  const pct = Math.round(Number(best.advanceRate));
  const dueYmd = best.fechaVencimiento
    ? best.fechaVencimiento.toISOString().slice(0, 10)
    : null;
  return {
    active: true,
    pct: Number.isFinite(pct) ? pct : 100,
    factorName: best.factoringCompany || null,
    funded: (FUNDED_CESSION_STATUSES as readonly string[]).includes(best.status),
    dueYmd,
  };
}

/**
 * Fallback cuando `paymentStatus=CEDED` pero no hay operación en BD
 * (cesión externa reconciliada).
 */
export function cessionFromPaymentStatus(paymentStatus: string): CessionInfo | null {
  if (paymentStatus !== "CEDED") return null;
  return {
    active: true,
    pct: 100,
    factorName: null,
    funded: false,
    dueYmd: null,
  };
}

/**
 * Heurística de retención comercial (filas "Cliente 20%" vs "Cliente 80%").
 * Confirmado en Gard: son DTEs/templates distintos, no dos ocurrencias del mismo DTE.
 * Porcentaje < 50 en el nombre ⇒ retención; también "retención" literal.
 */
export function isCededRetentionName(name: string | null | undefined): boolean {
  if (!name) return false;
  if (/retenci[oó]n/i.test(name)) return true;
  const m = name.match(/(\d+)\s*%/);
  if (!m) return false;
  const pct = Number(m[1]);
  return Number.isFinite(pct) && pct > 0 && pct < 50;
}

/** Etiqueta corta del origen del término de pago. */
export function termSourceLabel(source: DueDateSource): string {
  switch (source) {
    case "contrato":
      return "contrato";
    case "tenant":
      return "default tenant";
    case "explicit":
      return "explícito";
    default:
      return "default";
  }
}
