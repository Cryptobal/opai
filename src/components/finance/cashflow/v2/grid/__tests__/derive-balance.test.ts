import { describe, it, expect } from "vitest";
import type {
  ProjectionBucket,
  ProjectionRow,
  ProjectionAnchorInfo,
} from "@/modules/finance/cashflow/types";
import { deriveCumulative } from "../derive-balance";

function bucket(
  key: string,
  startIso: string,
  endIso: string,
): ProjectionBucket {
  return {
    key,
    label: key,
    start: new Date(startIso),
    end: new Date(endIso),
    income: 0,
    expense: 0,
    net: 0,
    actualIncome: 0,
    actualExpense: 0,
    varianceClp: 0,
    actualBankIncome: 0,
    actualBankExpense: 0,
    actualBankNet: 0,
    bankVarianceClp: 0,
    occurrences: [],
  };
}

function incomeRow(
  amounts: Record<string, number>,
): ProjectionRow {
  return {
    categoryId: "inc",
    categoryCode: "ING",
    categoryName: "Ingresos",
    kind: "INCOME",
    total: Object.values(amounts).reduce((s, a) => s + a, 0),
    values: Object.entries(amounts).map(([bucketKey, amount]) => ({
      bucketKey,
      amount,
    })),
    items: [],
  };
}

function expenseRow(
  amounts: Record<string, number>,
): ProjectionRow {
  return {
    categoryId: "exp",
    categoryCode: "EGR",
    categoryName: "Egresos",
    kind: "EXPENSE",
    total: Object.values(amounts).reduce((s, a) => s + a, 0),
    values: Object.entries(amounts).map(([bucketKey, amount]) => ({
      bucketKey,
      amount,
    })),
    items: [],
  };
}

/** Semanas W27–W30 de 2026 (lun–dom UTC). */
const BUCKETS = [
  bucket("2026-W27", "2026-06-29T00:00:00.000Z", "2026-07-05T23:59:59.999Z"),
  bucket("2026-W28", "2026-07-06T00:00:00.000Z", "2026-07-12T23:59:59.999Z"),
  bucket("2026-W29", "2026-07-13T00:00:00.000Z", "2026-07-19T23:59:59.999Z"),
  bucket("2026-W30", "2026-07-20T00:00:00.000Z", "2026-07-26T23:59:59.999Z"),
];

describe("deriveCumulative — paridad con proyección server (rama proyectada)", () => {
  it("sin ancla: opening + Σ(ingresos − egresos) por bucket", () => {
    const opening = 100_000;
    const rows = [
      incomeRow({
        "2026-W27": 10_000,
        "2026-W28": 0, // semana monto 0
        "2026-W29": 5_000,
        "2026-W30": 2_000,
      }),
      expenseRow({
        "2026-W27": 3_000,
        "2026-W28": 0,
        "2026-W29": 1_000,
        "2026-W30": 4_000,
      }),
    ];
    // nets: 7000, 0, 4000, -2000
    // balances a mano: 107000, 107000, 111000, 109000
    const expected = [
      { bucketKey: "2026-W27", balanceClp: 107_000 },
      { bucketKey: "2026-W28", balanceClp: 107_000 },
      { bucketKey: "2026-W29", balanceClp: 111_000 },
      { bucketKey: "2026-W30", balanceClp: 109_000 },
    ];
    expect(deriveCumulative(BUCKETS, rows, opening, null)).toEqual(expected);
  });

  it("con ancla a mitad del rango: pre-ancla desde opening; post desde bankBalanceClp", () => {
    const opening = 50_000;
    const anchor: ProjectionAnchorInfo = {
      // Cierre de W28 (domingo 12 jul) — W27/W28 pre-ancla; W29+ parten del ancla
      weekEndDate: "2026-07-12T23:59:59.999Z",
      bankBalanceClp: 80_000,
      isManual: false,
      manualReason: null,
    };
    const rows = [
      incomeRow({
        "2026-W27": 10_000,
        "2026-W28": 5_000,
        "2026-W29": 20_000,
        "2026-W30": 1_000,
      }),
      expenseRow({
        "2026-W27": 2_000,
        "2026-W28": 1_000,
        "2026-W29": 5_000,
        "2026-W30": 500,
      }),
    ];
    // Pre (end <= anchor): W27 net=8000 → 58000; W28 net=4000 → 62000
    // Post: W29 = 80000 + 15000 = 95000; W30 = 95000 + 500 = 95500
    const expected = [
      { bucketKey: "2026-W27", balanceClp: 58_000 },
      { bucketKey: "2026-W28", balanceClp: 62_000 },
      { bucketKey: "2026-W29", balanceClp: 95_000 },
      { bucketKey: "2026-W30", balanceClp: 95_500 },
    ];
    expect(deriveCumulative(BUCKETS, rows, opening, anchor)).toEqual(expected);
  });

  it("fila solo-egresos: nets negativos acumulan desde opening", () => {
    const opening = 40_000;
    const rows = [
      expenseRow({
        "2026-W27": 10_000,
        "2026-W28": 5_000,
        "2026-W29": 0,
        "2026-W30": 20_000,
      }),
    ];
    expect(deriveCumulative(BUCKETS, rows, opening, null)).toEqual([
      { bucketKey: "2026-W27", balanceClp: 30_000 },
      { bucketKey: "2026-W28", balanceClp: 25_000 },
      { bucketKey: "2026-W29", balanceClp: 25_000 },
      { bucketKey: "2026-W30", balanceClp: 5_000 },
    ]);
  });
});
