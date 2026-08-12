import { describe, it, expect } from "vitest";
import {
  deriveDtePaymentStatusFromAllocations,
  isManualPaidWithoutReconciliation,
  DTE_PAYMENT_ROUNDING_TOLERANCE_CLP,
} from "../dte-payment-status";

describe("deriveDtePaymentStatusFromAllocations", () => {
  it("sin allocations → UNPAID si no venció", () => {
    expect(
      deriveDtePaymentStatusFromAllocations({
        totalAmount: 1_000_000,
        allocatedPaid: 0,
        dueDate: new Date("2099-12-31"),
      }),
    ).toBe("UNPAID");
  });

  it("sin allocations → OVERDUE si dueDate pasó", () => {
    expect(
      deriveDtePaymentStatusFromAllocations({
        totalAmount: 1_000_000,
        allocatedPaid: 0,
        dueDate: new Date("2020-01-01"),
      }),
    ).toBe("OVERDUE");
  });

  it("cobro parcial → PARTIAL", () => {
    expect(
      deriveDtePaymentStatusFromAllocations({
        totalAmount: 1_000_000,
        allocatedPaid: 400_000,
      }),
    ).toBe("PARTIAL");
  });

  it("cobro total → PAID", () => {
    expect(
      deriveDtePaymentStatusFromAllocations({
        totalAmount: 1_000_000,
        allocatedPaid: 1_000_000,
      }),
    ).toBe("PAID");
  });

  it("tolera residuo de redondeo bulk N→M (≤ $5 CLP)", () => {
    const total = 1_000_000;
    const paid = total - DTE_PAYMENT_ROUNDING_TOLERANCE_CLP;
    expect(
      deriveDtePaymentStatusFromAllocations({ totalAmount: total, allocatedPaid: paid }),
    ).toBe("PAID");
  });

  it("fuera de tolerancia → PARTIAL", () => {
    const total = 1_000_000;
    const paid = total - DTE_PAYMENT_ROUNDING_TOLERANCE_CLP - 1;
    expect(
      deriveDtePaymentStatusFromAllocations({ totalAmount: total, allocatedPaid: paid }),
    ).toBe("PARTIAL");
  });
});

describe("isManualPaidWithoutReconciliation", () => {
  it("detecta PAID manual sin cartola", () => {
    expect(
      isManualPaidWithoutReconciliation({
        allocatedPaid: 0,
        paymentStatus: "PAID",
        reconciledAt: null,
        amountPaid: 500_000,
        totalAmount: 500_000,
      }),
    ).toBe(true);
  });

  it("no aplica si hay allocations (conciliación bancaria)", () => {
    expect(
      isManualPaidWithoutReconciliation({
        allocatedPaid: 500_000,
        paymentStatus: "PAID",
        reconciledAt: null,
        amountPaid: 500_000,
        totalAmount: 500_000,
      }),
    ).toBe(false);
  });

  it("no aplica si ya hay reconciledAt", () => {
    expect(
      isManualPaidWithoutReconciliation({
        allocatedPaid: 0,
        paymentStatus: "PAID",
        reconciledAt: new Date(),
        amountPaid: 500_000,
        totalAmount: 500_000,
      }),
    ).toBe(false);
  });
});

/**
 * Escenario Carlos (Gard): conciliar depósito a F#1774 NO marca F#1748.
 * Este test documenta el invariante por folio — no hay sync cruzado entre DTEs.
 */
describe("invariante folio específico (caso Carlos)", () => {
  it("el pago de un folio no afecta otro folio del mismo cliente", () => {
    const invoice1748 = deriveDtePaymentStatusFromAllocations({
      totalAmount: 2_000_000,
      allocatedPaid: 0,
    });
    const invoice1774 = deriveDtePaymentStatusFromAllocations({
      totalAmount: 2_000_000,
      allocatedPaid: 2_000_000,
    });
    expect(invoice1748).toBe("UNPAID");
    expect(invoice1774).toBe("PAID");
  });
});
