import { describe, it, expect } from "vitest";
import type {
  ProjectionBucket,
  ProjectionMatrix,
  ProjectionRow,
} from "@/modules/finance/cashflow/types";
import { replaceWeeks } from "../week-cache-merge";

const KEYS = ["2026-W27", "2026-W28", "2026-W29", "2026-W30"] as const;

function bucket(key: string, weekOffset: number, income = 100): ProjectionBucket {
  const start = new Date(Date.UTC(2026, 5, 29 + weekOffset * 7));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  end.setUTCHours(23, 59, 59, 999);
  return {
    key,
    label: key,
    start,
    end,
    income,
    expense: 40,
    net: income - 40,
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
  name = "Cliente",
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
        itemName: name,
        installationId: null,
        installationName: null,
        crmAccountId: null,
        crmAccountName: null,
        baseAmount: 0,
        currency: "CLP",
        source: "MANUAL",
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

describe("replaceWeeks", () => {
  it("mover cuota entre 2 semanas del rango: el parche refleja ambas", () => {
    const base = matrix4();
    // W28 pierde i1; W29 gana el monto de W28
    const patch: ProjectionMatrix = {
      ...base,
      buckets: [bucket("2026-W28", 1, 0), bucket("2026-W29", 2, 5000)],
      rows: [
        rowWithValues("i1", { "2026-W28": 0, "2026-W29": 5000 }),
      ],
      cumulativeBalances: [
        { bucketKey: "2026-W28", balanceClp: 51_000 },
        { bucketKey: "2026-W29", balanceClp: 56_000 },
      ],
      cumulativePoints: [
        {
          bucketKey: "2026-W28",
          projectedClp: 51_000,
          realBankClp: null,
          cumulativeBankVarianceClp: null,
        },
        {
          bucketKey: "2026-W29",
          projectedClp: 56_000,
          realBankClp: null,
          cumulativeBankVarianceClp: null,
        },
      ],
    };
    const out = replaceWeeks(base, patch);
    const vals = Object.fromEntries(
      out.rows[0].items[0].values.map((v) => [v.bucketKey, v.amount]),
    );
    expect(vals["2026-W28"]).toBe(0);
    expect(vals["2026-W29"]).toBe(5000);
    expect(vals["2026-W27"]).toBe(1000);
    expect(vals["2026-W30"]).toBe(4000);
  });

  it("crear manual → fila nueva aparece", () => {
    const base = matrix4();
    // buildProjection parcial incluye TODAS las filas del tenant en el rango.
    const patch: ProjectionMatrix = {
      ...base,
      buckets: [bucket("2026-W28", 1)],
      rows: [
        rowWithValues("i1", { "2026-W28": 2000 }),
        rowWithValues("new-manual", { "2026-W28": 750 }, "Anticipo"),
      ],
      cumulativeBalances: [{ bucketKey: "2026-W28", balanceClp: 52_750 }],
      cumulativePoints: [
        {
          bucketKey: "2026-W28",
          projectedClp: 52_750,
          realBankClp: null,
          cumulativeBankVarianceClp: null,
        },
      ],
    };
    const out = replaceWeeks(base, patch);
    expect(out.rows.some((r) => r.items.some((i) => i.itemId === "new-manual"))).toBe(
      true,
    );
    expect(
      out.rows
        .flatMap((r) => r.items)
        .find((i) => i.itemId === "i1")
        ?.values.find((v) => v.bucketKey === "2026-W27")?.amount,
    ).toBe(1000);
  });

  it("ocultar → la key queda sin ese value", () => {
    const base = matrix4();
    const patch: ProjectionMatrix = {
      ...base,
      buckets: [bucket("2026-W28", 1)],
      rows: [rowWithValues("i1", {})], // sin value en W28
      cumulativeBalances: [{ bucketKey: "2026-W28", balanceClp: 51_000 }],
      cumulativePoints: [
        {
          bucketKey: "2026-W28",
          projectedClp: 51_000,
          realBankClp: null,
          cumulativeBankVarianceClp: null,
        },
      ],
    };
    const out = replaceWeeks(base, patch);
    expect(
      out.rows[0].items[0].values.find((v) => v.bucketKey === "2026-W28"),
    ).toBeUndefined();
    expect(
      out.rows[0].items[0].values.find((v) => v.bucketKey === "2026-W27")?.amount,
    ).toBe(1000);
  });

  it("keys fuera del parche no cambian", () => {
    const base = matrix4();
    const patch: ProjectionMatrix = {
      ...base,
      buckets: [bucket("2026-W28", 1, 999)],
      rows: [rowWithValues("i1", { "2026-W28": 999 })],
      cumulativeBalances: [{ bucketKey: "2026-W28", balanceClp: 99 }],
      cumulativePoints: [
        {
          bucketKey: "2026-W28",
          projectedClp: 99,
          realBankClp: null,
          cumulativeBankVarianceClp: null,
        },
      ],
    };
    const out = replaceWeeks(base, patch);
    expect(out.buckets.find((b) => b.key === "2026-W27")?.income).toBe(100);
    expect(out.cumulativeBalances.find((p) => p.bucketKey === "2026-W30")?.balanceClp).toBe(
      54_000,
    );
  });

  it("cumulativeBalances del rango parcheado quedan los del incoming", () => {
    const base = matrix4();
    const patch: ProjectionMatrix = {
      ...base,
      buckets: [bucket("2026-W28", 1), bucket("2026-W29", 2)],
      rows: [rowWithValues("i1", { "2026-W28": 1, "2026-W29": 2 })],
      cumulativeBalances: [
        { bucketKey: "2026-W28", balanceClp: 111 },
        { bucketKey: "2026-W29", balanceClp: 222 },
      ],
      cumulativePoints: [
        {
          bucketKey: "2026-W28",
          projectedClp: 111,
          realBankClp: null,
          cumulativeBankVarianceClp: null,
        },
        {
          bucketKey: "2026-W29",
          projectedClp: 222,
          realBankClp: null,
          cumulativeBankVarianceClp: null,
        },
      ],
    };
    const out = replaceWeeks(base, patch);
    expect(out.cumulativeBalances.find((p) => p.bucketKey === "2026-W28")?.balanceClp).toBe(
      111,
    );
    expect(out.cumulativeBalances.find((p) => p.bucketKey === "2026-W29")?.balanceClp).toBe(
      222,
    );
    expect(out.cumulativeBalances.find((p) => p.bucketKey === "2026-W27")?.balanceClp).toBe(
      51_000,
    );
  });
});
