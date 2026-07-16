import { describe, it, expect } from "vitest";
import type {
  ProjectionBucket,
  ProjectionMatrix,
  ProjectionRow,
} from "@/modules/finance/cashflow/types";
import { dropWeeks, mergeMatrix } from "../week-cache-merge";

const KEYS = ["2026-W27", "2026-W28", "2026-W29", "2026-W30"] as const;

function bucket(key: string, weekOffset: number): ProjectionBucket {
  const start = new Date(Date.UTC(2026, 5, 29 + weekOffset * 7)); // ~W27 lunes
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  end.setUTCHours(23, 59, 59, 999);
  return {
    key,
    label: key,
    start,
    end,
    income: 100,
    expense: 40,
    net: 60,
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

function rowWithValues(
  itemId: string,
  amounts: Record<string, number>,
): ProjectionRow {
  const values = Object.entries(amounts).map(([bucketKey, amount]) => ({
    bucketKey,
    amount,
    actualAmount: null,
    occurrenceId: amount ? `occ-${itemId}-${bucketKey}` : null,
    scheduledDate: "2026-07-01",
    dteId: null,
  }));
  return {
    categoryId: "cat",
    categoryCode: "ING",
    categoryName: "Ingresos",
    kind: "INCOME",
    total: values.reduce((s, v) => s + v.amount, 0),
    values,
    items: [
      {
        itemId,
        itemName: "Cliente",
        installationId: null,
        installationName: null,
        crmAccountId: null,
        crmAccountName: null,
        baseAmount: 0,
        currency: "CLP",
        source: "RECURRING_DTE",
        sourceRefCode: null,
        hasIpcAdjustment: false,
        ipcAdjustmentMonths: null,
        headcount: 0,
        nickname: null,
        isExtraInvoice: false,
        values: [...values],
        total: values.reduce((s, v) => s + v.amount, 0),
        totalActual: 0,
      },
    ],
  };
}

function matrix4(): ProjectionMatrix {
  const amounts = {
    "2026-W27": 1000,
    "2026-W28": 2000,
    "2026-W29": 3000,
    "2026-W30": 4000,
  };
  return {
    range: {
      from: new Date("2026-06-29"),
      to: new Date("2026-07-26"),
      granularity: "weekly",
    },
    buckets: KEYS.map((k, i) => bucket(k, i)),
    rows: [rowWithValues("i1", amounts)],
    totals: {
      totalIncome: 10000,
      totalExpense: 0,
      totalNet: 10000,
      totalActualIncome: 0,
      totalActualExpense: 0,
      totalVariance: 0,
      currentDriftClp: null,
    },
    openingBalanceClp: 50_000,
    openingBreakdown: {
      accounts: [],
      totalClp: 50_000,
      asOf: new Date().toISOString(),
    },
    cumulativeBalances: KEYS.map((k, i) => ({
      bucketKey: k,
      balanceClp: 50_000 + (i + 1) * 1000,
    })),
    cumulativePoints: KEYS.map((k, i) => ({
      bucketKey: k,
      projectedClp: 50_000 + (i + 1) * 1000,
      realBankClp: null,
      cumulativeBankVarianceClp: null,
    })),
    unresolvedBankLinks: [],
    anchor: null,
  };
}

describe("dropWeeks", () => {
  it("matriz de 4 semanas → drop de 2 → quedan 2", () => {
    const base = matrix4();
    const dropped = dropWeeks(base, ["2026-W28", "2026-W29"]);
    expect(dropped.buckets.map((b) => b.key)).toEqual(["2026-W27", "2026-W30"]);
    expect(dropped.cumulativeBalances.map((p) => p.bucketKey)).toEqual([
      "2026-W27",
      "2026-W30",
    ]);
    expect(dropped.cumulativePoints.map((p) => p.bucketKey)).toEqual([
      "2026-W27",
      "2026-W30",
    ]);
    const itemVals = dropped.rows[0].items[0].values.map((v) => v.bucketKey);
    expect(itemVals).toEqual(["2026-W27", "2026-W30"]);
    expect(dropped.rows[0].values.map((v) => v.bucketKey)).toEqual([
      "2026-W27",
      "2026-W30",
    ]);
  });

  it("merge posterior con fetch de las 2 podadas restaura el estado completo", () => {
    const base = matrix4();
    const dropped = dropWeeks(base, ["2026-W28", "2026-W29"]);

    // Fetch parcial de las semanas podadas (como haría ensureRange del hueco).
    const incoming: ProjectionMatrix = {
      ...matrix4(),
      buckets: [bucket("2026-W28", 1), bucket("2026-W29", 2)],
      rows: [
        rowWithValues("i1", {
          "2026-W28": 2000,
          "2026-W29": 3000,
        }),
      ],
      cumulativeBalances: [
        { bucketKey: "2026-W28", balanceClp: 52_000 },
        { bucketKey: "2026-W29", balanceClp: 53_000 },
      ],
      cumulativePoints: [
        {
          bucketKey: "2026-W28",
          projectedClp: 52_000,
          realBankClp: null,
          cumulativeBankVarianceClp: null,
        },
        {
          bucketKey: "2026-W29",
          projectedClp: 53_000,
          realBankClp: null,
          cumulativeBankVarianceClp: null,
        },
      ],
    };

    const restored = mergeMatrix(dropped, incoming);
    expect(restored.buckets.map((b) => b.key).sort()).toEqual([...KEYS].sort());
    const vals = restored.rows[0].items[0].values;
    expect(vals.find((v) => v.bucketKey === "2026-W28")?.amount).toBe(2000);
    expect(vals.find((v) => v.bucketKey === "2026-W29")?.amount).toBe(3000);
    expect(vals.find((v) => v.bucketKey === "2026-W27")?.amount).toBe(1000);
    expect(vals.find((v) => v.bucketKey === "2026-W30")?.amount).toBe(4000);
  });

  it("values de items de semanas podadas desaparecen y reaparecen", () => {
    const base = matrix4();
    const dropped = dropWeeks(base, ["2026-W27"]);
    expect(
      dropped.rows[0].items[0].values.some((v) => v.bucketKey === "2026-W27"),
    ).toBe(false);

    const restored = mergeMatrix(dropped, {
      ...matrix4(),
      buckets: [bucket("2026-W27", 0)],
      rows: [rowWithValues("i1", { "2026-W27": 999 })],
      cumulativeBalances: [{ bucketKey: "2026-W27", balanceClp: 51_000 }],
      cumulativePoints: [
        {
          bucketKey: "2026-W27",
          projectedClp: 51_000,
          realBankClp: null,
          cumulativeBankVarianceClp: null,
        },
      ],
    });
    expect(
      restored.rows[0].items[0].values.find((v) => v.bucketKey === "2026-W27")
        ?.amount,
    ).toBe(999);
  });
});
