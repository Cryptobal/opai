import { describe, it, expect } from "vitest";

function recalcParcial(args: {
  totalAmount: number;
  amountPaid: number;
  ncTotalGross: number;
  prevStatus: "UNPAID" | "PARTIAL" | "OVERDUE";
}): { amountPending: number; status: "PAID" | "PARTIAL" | "UNPAID" } {
  const newAmountPending = Math.max(
    0,
    args.totalAmount - args.amountPaid - args.ncTotalGross,
  );
  const status: "PAID" | "PARTIAL" | "UNPAID" =
    newAmountPending === 0
      ? "PAID"
      : args.amountPaid > 0
        ? "PARTIAL"
        : args.prevStatus === "PARTIAL"
          ? "PARTIAL"
          : "UNPAID";
  return { amountPending: newAmountPending, status };
}

describe("credit-note recalc parcial (CodRef=3)", () => {
  it("NC cubre el total exacto → PAID y saldo 0", () => {
    expect(
      recalcParcial({
        totalAmount: 119000,
        amountPaid: 0,
        ncTotalGross: 119000,
        prevStatus: "UNPAID",
      }),
    ).toEqual({ amountPending: 0, status: "PAID" });
  });

  it("NC parcial sin pagos previos → UNPAID con saldo reducido", () => {
    expect(
      recalcParcial({
        totalAmount: 119000,
        amountPaid: 0,
        ncTotalGross: 50000,
        prevStatus: "UNPAID",
      }),
    ).toEqual({ amountPending: 69000, status: "UNPAID" });
  });

  it("NC parcial con pago previo → PARTIAL", () => {
    expect(
      recalcParcial({
        totalAmount: 119000,
        amountPaid: 40000,
        ncTotalGross: 50000,
        prevStatus: "UNPAID",
      }),
    ).toEqual({ amountPending: 29000, status: "PARTIAL" });
  });

  it("NC parcial cubre todo lo restante → PAID", () => {
    expect(
      recalcParcial({
        totalAmount: 119000,
        amountPaid: 69000,
        ncTotalGross: 50000,
        prevStatus: "PARTIAL",
      }),
    ).toEqual({ amountPending: 0, status: "PAID" });
  });
});
