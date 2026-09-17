/**
 * Resuelve el mes rotulado de Proforma / Estado de Pago.
 *
 * Función pura (sin I/O): el PDF, el email (`{{periodo}}`) y los tests
 * comparten la misma regla.
 *
 *   - Estado de Pago: si hay `billingPeriod` (período facturado / cuota),
 *     ese mes ES el rótulo. Los borradores creados por programación
 *     nacían con `estadoPagoPeriodoMode=PREVIOUS` y, una vez emitidos al
 *     SII, ese flag ya no se puede editar — por eso no puede ser la
 *     fuente de verdad. Sin período facturado, se usa la fecha de
 *     emisión ± el selector Mes en curso / anterior.
 *   - Proforma (y resto): si hay programación, el mes sigue
 *     `billingPeriod + periodPolicy` para coincidir con `{{periodo}}`
 *     de las líneas. Si no, el mes de emisión.
 */

import {
  resolvePeriodFromPolicy,
  type PeriodPolicy,
} from "@/modules/finance/billing/placeholders";

export type BillingDocPeriodoVariant =
  | "PROFORMA"
  | "ESTADO_DE_PAGO"
  | "DTE_PREVIEW";

export type EstadoPagoPeriodoMode = "CURRENT" | "PREVIOUS";

export interface ResolveBillingDocPeriodoInput {
  variant: BillingDocPeriodoVariant;
  /** Fecha de emisión del DTE (se lee en UTC). */
  issueDate: Date;
  estadoPagoPeriodoMode?: string | null;
  /** YYYY-MM del período facturado. Fuente de verdad del rótulo del EP. */
  billingPeriod?: string | null;
  /**
   * Solo aplica a Proforma / DTE_PREVIEW. El EP usa `billingPeriod`
   * directo, sin `periodPolicy`.
   */
  recurring?: {
    billingPeriod: string;
    periodPolicy: PeriodPolicy | string | null | undefined;
  } | null;
}

export interface ResolveBillingDocPeriodoResult {
  periodoDate: Date;
  /** Capitalizado, idéntico a `{{periodo}}` (ej: "Agosto 2026"). */
  periodoLabel: string;
}

const BILLING_PERIOD_RE = /^\d{4}-\d{2}$/;

/**
 * Default del EP al generar un borrador desde una programación:
 * `PREVIOUS_MONTH` → mes anterior; el resto (incl. `NEXT_MONTH`) → mes en curso.
 */
export function estadoPagoPeriodoModeFromPolicy(
  periodPolicy: string | null | undefined,
): EstadoPagoPeriodoMode {
  return periodPolicy === "PREVIOUS_MONTH" ? "PREVIOUS" : "CURRENT";
}

function parseBillingPeriod(
  billingPeriod: string | null | undefined,
): [number, number] | null {
  if (!billingPeriod || !BILLING_PERIOD_RE.test(billingPeriod)) return null;
  const [year, month] = billingPeriod.split("-").map(Number);
  if (!year || !month || month < 1 || month > 12) return null;
  return [year, month];
}

function fromPeriodInfo(period: {
  mes: string;
  anio: number;
  periodoCorto: string;
}): ResolveBillingDocPeriodoResult {
  const [pMonth, pYear] = period.periodoCorto.split("/").map(Number);
  return {
    periodoDate: new Date(Date.UTC(pYear, pMonth - 1, 1)),
    periodoLabel: `${period.mes} ${period.anio}`,
  };
}

function fromYearMonth(year: number, month1to12: number): ResolveBillingDocPeriodoResult {
  const anchor = new Date(Date.UTC(year, month1to12 - 1, 1));
  return fromPeriodInfo(resolvePeriodFromPolicy("CURRENT_MONTH", anchor));
}

/** "2026-08" → "Agosto 2026". Null si el valor no es YYYY-MM. */
export function formatBillingPeriodLabel(
  billingPeriod: string | null | undefined,
): string | null {
  const bp = parseBillingPeriod(billingPeriod);
  if (!bp) return null;
  return fromYearMonth(bp[0], bp[1]).periodoLabel;
}

export function resolveBillingDocPeriodo(
  input: ResolveBillingDocPeriodoInput,
): ResolveBillingDocPeriodoResult {
  if (input.variant === "ESTADO_DE_PAGO") {
    const bp = parseBillingPeriod(input.billingPeriod);
    if (bp) {
      return fromYearMonth(bp[0], bp[1]);
    }
    const policy: PeriodPolicy =
      input.estadoPagoPeriodoMode === "PREVIOUS"
        ? "PREVIOUS_MONTH"
        : "CURRENT_MONTH";
    return fromPeriodInfo(resolvePeriodFromPolicy(policy, input.issueDate));
  }

  const recurringBp = parseBillingPeriod(input.recurring?.billingPeriod);
  if (recurringBp) {
    const [bpYear, bpMonth] = recurringBp;
    const policy =
      (input.recurring?.periodPolicy as PeriodPolicy) ?? "CURRENT_MONTH";
    const anchor = new Date(Date.UTC(bpYear, bpMonth - 1, 1));
    return fromPeriodInfo(resolvePeriodFromPolicy(policy, anchor));
  }

  return fromPeriodInfo(resolvePeriodFromPolicy("CURRENT_MONTH", input.issueDate));
}
