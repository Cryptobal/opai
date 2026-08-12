/**
 * Derivación pura del estado de pago de un DTE a partir de allocations.
 *
 * Fuente de verdad del monto cobrado/pagado: Σ FinancePaymentAllocation.amount
 * (pagos CONFIRMED, no CANCELLED). El campo `FinanceDte.paymentStatus` se
 * recalcula vía `recomputeDtePaymentAggregate` en bank-tx-link.service.ts
 * cada vez que se concilia/desconcilia un movimiento bancario contra el DTE.
 *
 * `reconciledAt` es INDEPENDIENTE: indica si hay link bancario DTE_*,
 * no si el saldo está cerrado (ver docs/02-implementation/finance/
 * dte-payment-vs-bank-reconciliation.md).
 */

import { resolveUnpaidPaymentStatus } from "./dte-overdue.service";

/** Tolerancia CLP para redondeo en conciliaciones N→M (bulk reconcile). */
export const DTE_PAYMENT_ROUNDING_TOLERANCE_CLP = 5;

export type DerivedDtePaymentStatus = "PAID" | "PARTIAL" | "UNPAID" | "OVERDUE";

export interface DeriveDtePaymentStatusInput {
  totalAmount: number;
  /** Suma de allocations vivas (FinancePaymentAllocation). */
  allocatedPaid: number;
  dueDate?: Date | null;
  /** paymentStatus previo — usado si allocatedPaid=0 (preservar OVERDUE). */
  currentPaymentStatus?: string;
}

/**
 * Deriva paymentStatus desde allocations, sin write-off ni marca manual.
 * Write-off y bulk-mark-paid se resuelven en bank-tx-link / bulk-mark-paid.
 */
export function deriveDtePaymentStatusFromAllocations(
  input: DeriveDtePaymentStatusInput,
): DerivedDtePaymentStatus {
  const {
    totalAmount,
    allocatedPaid,
    dueDate,
    currentPaymentStatus = "UNPAID",
  } = input;

  if (allocatedPaid <= 0) {
    return resolveUnpaidPaymentStatus(dueDate, currentPaymentStatus);
  }
  if (allocatedPaid + DTE_PAYMENT_ROUNDING_TOLERANCE_CLP >= totalAmount) {
    return "PAID";
  }
  return "PARTIAL";
}

/**
 * Invariante bulk-mark-paid: PAID sin allocations ni reconciledAt no debe
 * revertirse a UNPAID al recompute (pago registrado manualmente, sin cartola).
 */
export function isManualPaidWithoutReconciliation(input: {
  allocatedPaid: number;
  paymentStatus: string;
  reconciledAt: Date | null;
  amountPaid: number;
  totalAmount: number;
}): boolean {
  return (
    input.allocatedPaid <= 0 &&
    input.paymentStatus === "PAID" &&
    input.reconciledAt === null &&
    input.amountPaid + 0.01 >= input.totalAmount
  );
}
