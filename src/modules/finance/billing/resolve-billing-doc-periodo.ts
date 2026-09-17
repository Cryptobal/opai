/**
 * Resuelve el mes rotulado de Proforma / Estado de Pago.
 *
 * Función pura (sin I/O): el PDF, el email (`{{periodo}}`) y los tests
 * comparten la misma regla.
 *
 *   - Estado de Pago: el selector del formulario (`estadoPagoPeriodoMode`)
 *     gana siempre, anclado a la fecha de emisión. Una programación
 *     vinculada NO lo pisa.
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
  /**
   * Solo aplica a Proforma / DTE_PREVIEW. El EP ignora este bloque
   * para honrar el selector del formulario.
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

export function resolveBillingDocPeriodo(
  input: ResolveBillingDocPeriodoInput,
): ResolveBillingDocPeriodoResult {
  if (input.variant === "ESTADO_DE_PAGO") {
    const policy: PeriodPolicy =
      input.estadoPagoPeriodoMode === "PREVIOUS"
        ? "PREVIOUS_MONTH"
        : "CURRENT_MONTH";
    return fromPeriodInfo(resolvePeriodFromPolicy(policy, input.issueDate));
  }

  const bp = parseBillingPeriod(input.recurring?.billingPeriod);
  if (bp) {
    const [bpYear, bpMonth] = bp;
    const policy = (input.recurring?.periodPolicy as PeriodPolicy) ?? "CURRENT_MONTH";
    const anchor = new Date(Date.UTC(bpYear, bpMonth - 1, 1));
    return fromPeriodInfo(resolvePeriodFromPolicy(policy, anchor));
  }

  return fromPeriodInfo(resolvePeriodFromPolicy("CURRENT_MONTH", input.issueDate));
}
