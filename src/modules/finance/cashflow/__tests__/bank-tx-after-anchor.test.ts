import { describe, it, expect } from "vitest";
import {
  bankTxDateFilterAfterAnchor,
  includeBankTxAfterAnchor,
} from "@/modules/finance/banking/bank-tx-after-anchor";

const asOf = new Date("2026-08-24T00:00:00.000Z");
const today = new Date("2026-08-25T00:00:00.000Z");
const creditSameDay = new Date("2026-08-24T00:00:00.000Z");
const creditNextDay = new Date("2026-08-25T00:00:00.000Z");
const creditBefore = new Date("2026-08-23T00:00:00.000Z");

describe("includeBankTxAfterAnchor", () => {
  it("ancla MANUAL: el abono visible del mismo día entra (borde asOfDate)", () => {
    expect(
      includeBankTxAfterAnchor({
        transactionDate: creditSameDay,
        anchorAsOfDate: asOf,
        asOfDate: today,
        anchorSource: "MANUAL",
      }),
    ).toBe(true);
  });

  it("ancla MANUAL: un MATCHED del día siguiente también entra", () => {
    expect(
      includeBankTxAfterAnchor({
        transactionDate: creditNextDay,
        anchorAsOfDate: asOf,
        asOfDate: today,
        anchorSource: "MANUAL",
      }),
    ).toBe(true);
  });

  it("ancla MANUAL: un movimiento anterior al ancla no entra", () => {
    expect(
      includeBankTxAfterAnchor({
        transactionDate: creditBefore,
        anchorAsOfDate: asOf,
        asOfDate: today,
        anchorSource: "MANUAL",
      }),
    ).toBe(false);
  });

  it("ancla IMPORT: el mismo día del cierre de cartola no se duplica", () => {
    expect(
      includeBankTxAfterAnchor({
        transactionDate: creditSameDay,
        anchorAsOfDate: asOf,
        asOfDate: today,
        anchorSource: "IMPORT",
      }),
    ).toBe(false);
  });

  it("sin source (ancla no-IMPORT) no tira la cartola del mismo día", () => {
    expect(
      includeBankTxAfterAnchor({
        transactionDate: creditSameDay,
        anchorAsOfDate: asOf,
        asOfDate: today,
        anchorSource: null,
      }),
    ).toBe(true);
  });
});

describe("bankTxDateFilterAfterAnchor", () => {
  it("MANUAL usa gte en el día del ancla", () => {
    expect(bankTxDateFilterAfterAnchor(asOf, today, "MANUAL")).toEqual({
      gte: asOf,
      lte: today,
    });
  });

  it("IMPORT usa gt para no duplicar el closing", () => {
    expect(bankTxDateFilterAfterAnchor(asOf, today, "IMPORT")).toEqual({
      gt: asOf,
      lte: today,
    });
  });
});
