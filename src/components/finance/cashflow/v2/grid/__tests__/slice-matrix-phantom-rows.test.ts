import { describe, it, expect } from "vitest";
import type {
  ProjectionBucket,
  ProjectionMatrix,
  ProjectionRow,
} from "@/modules/finance/cashflow/types";
import { mergeMatrix, sliceMatrix } from "../week-cache-merge";
import { weekSlots } from "../week-keys";

/**
 * Regresión: filas fantasma tras el prefetch.
 *
 * `usePrefetchWindow` trae en idle las ventanas ADYACENTES (no visibles) y
 * `mergeMatrix` las fusiona en el mismo caché que lee la ventana visible. Los
 * items que solo existen en esas semanas (keys sintéticas por fecha: `_prog:`,
 * `_extra:`, `_dte:` sin cuenta CRM → "Sin cliente") sobrevivían al slice con
 * `values: []` y se pintaban como filas vacías unos segundos después de cargar.
 */

const W27_MONDAY = new Date(Date.UTC(2026, 5, 29));

function bucketFor(key: string, weekOffset: number): ProjectionBucket {
  const start = new Date(Date.UTC(2026, 5, 29 + weekOffset * 7));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  end.setUTCHours(23, 59, 59, 999);
  return {
    key,
    label: key,
    start,
    end,
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

/** Una fila-categoría INCOME con un item por entrada de `items`. */
function incomeRow(items: Record<string, Record<string, number>>): ProjectionRow {
  const detail = Object.entries(items).map(([itemId, amounts]) => {
    const values = Object.entries(amounts).map(([bucketKey, amount]) => ({
      bucketKey,
      amount,
      actualAmount: null,
      occurrenceId: amount ? `occ-${itemId}-${bucketKey}` : null,
      scheduledDate: "2026-07-01",
      dteId: null,
    }));
    return {
      itemId,
      itemName: itemId,
      installationId: null,
      installationName: null,
      crmAccountId: null,
      crmAccountName: null,
      baseAmount: 0,
      currency: "CLP" as const,
      source: "RECURRING_DTE" as const,
      sourceRefCode: null,
      hasIpcAdjustment: false,
      ipcAdjustmentMonths: null,
      headcount: 0,
      nickname: null,
      isExtraInvoice: false,
      values,
      total: values.reduce((s, v) => s + v.amount, 0),
      totalActual: 0,
    };
  });
  const rowValues = Object.values(items)
    .flatMap((a) => Object.entries(a))
    .reduce<Record<string, number>>((acc, [k, v]) => {
      acc[k] = (acc[k] ?? 0) + v;
      return acc;
    }, {});
  const values = Object.entries(rowValues).map(([bucketKey, amount]) => ({
    bucketKey,
    amount,
    actualAmount: null,
    occurrenceId: null,
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
    items: detail,
  };
}

function matrixOf(
  bucketKeys: [string, number][],
  row: ProjectionRow,
): ProjectionMatrix {
  return {
    range: {
      from: new Date("2026-06-29"),
      to: new Date("2026-07-26"),
      granularity: "weekly",
    },
    buckets: bucketKeys.map(([k, i]) => bucketFor(k, i)),
    rows: [row],
    totals: {
      totalIncome: 0,
      totalExpense: 0,
      totalNet: 0,
      totalActualIncome: 0,
      totalActualExpense: 0,
      totalVariance: 0,
      currentDriftClp: null,
    },
    openingBalanceClp: 0,
    openingBreakdown: { accounts: [], totalClp: 0, asOf: "2026-06-29" },
    cumulativeBalances: [],
    cumulativePoints: [],
    unresolvedBankLinks: [],
    anchor: null,
  };
}

describe("sliceMatrix · filas fantasma del prefetch", () => {
  it("descarta el item que solo tiene values fuera de la ventana visible", () => {
    // Ventana visible: W27-W30. Fetch inicial trae el contrato real.
    const visible = matrixOf(
      [
        ["2026-W27", 0],
        ["2026-W28", 1],
        ["2026-W29", 2],
        ["2026-W30", 3],
      ],
      incomeRow({
        contrato: {
          "2026-W27": 1000,
          "2026-W28": 0,
          "2026-W29": 0,
          "2026-W30": 0,
        },
      }),
    );

    // Prefetch de la ventana SIGUIENTE (W31-W32): trae una PROGRAMADA que solo
    // existe allí. Antes del fix, se colaba en la ventana visible sin values.
    const prefetched = matrixOf(
      [
        ["2026-W31", 4],
        ["2026-W32", 5],
      ],
      incomeRow({
        "_prog:abc:2026-08-03": { "2026-W31": 5000, "2026-W32": 0 },
      }),
    );

    const merged = mergeMatrix(visible, prefetched);
    // El caché fusionado SÍ conserva ambos items (navegar allá debe ser instantáneo).
    expect(merged.rows[0].items.map((i) => i.itemId).sort()).toEqual([
      "_prog:abc:2026-08-03",
      "contrato",
    ]);

    const sliced = sliceMatrix(merged, weekSlots(W27_MONDAY, 4));
    expect(sliced.rows[0].items.map((i) => i.itemId)).toEqual(["contrato"]);
  });

  it("conserva el item cuyas cuotas caen solo en la mitad tardía de la ventana", () => {
    const early = matrixOf(
      [
        ["2026-W27", 0],
        ["2026-W28", 1],
      ],
      incomeRow({ contrato: { "2026-W27": 1000, "2026-W28": 0 } }),
    );
    // Chunk posterior de la MISMA ventana visible: item nuevo, con cuota en W30.
    const late = matrixOf(
      [
        ["2026-W29", 2],
        ["2026-W30", 3],
      ],
      incomeRow({ tardio: { "2026-W29": 0, "2026-W30": 7000 } }),
    );

    const sliced = sliceMatrix(
      mergeMatrix(early, late),
      weekSlots(W27_MONDAY, 4),
    );
    expect(sliced.rows[0].items.map((i) => i.itemId).sort()).toEqual([
      "contrato",
      "tardio",
    ]);
  });

  it("no toca row.values: la fila FC de saldo deriva de ahí", () => {
    const visible = matrixOf(
      [["2026-W27", 0]],
      incomeRow({ contrato: { "2026-W27": 1000 } }),
    );
    const prefetched = matrixOf(
      [["2026-W31", 4]],
      incomeRow({ "_extra:xyz": { "2026-W31": 5000 } }),
    );

    const sliced = sliceMatrix(
      mergeMatrix(visible, prefetched),
      weekSlots(W27_MONDAY, 4),
    );
    // W31 queda fuera de la ventana → su value de categoría tampoco entra, y
    // los que sí entran conservan su monto intacto.
    expect(
      sliced.rows[0].values.find((v) => v.bucketKey === "2026-W27")?.amount,
    ).toBe(1000);
    expect(sliced.rows[0].values.some((v) => v.bucketKey === "2026-W31")).toBe(
      false,
    );
  });
});
