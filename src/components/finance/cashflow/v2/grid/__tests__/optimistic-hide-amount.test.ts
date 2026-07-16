import { describe, it, expect } from "vitest";
import {
  applyOptimisticHides,
  applyOptimisticAmounts,
} from "../optimistic-move";
import type { ProjectionRow } from "@/modules/finance/cashflow/types";

/** Fila mínima con un item y dos buckets. */
function row(itemId: string, s27: number, s28: number): ProjectionRow {
  const mkVal = (bucketKey: string, amount: number) => ({
    bucketKey,
    amount,
    actualAmount: null,
    occurrenceId: amount ? `occ-${bucketKey}` : null,
    scheduledDate: `2026-07-${bucketKey === "s27" ? "01" : "08"}`,
    dteId: null,
  });
  return {
    categoryId: "cat",
    categoryCode: "ING",
    categoryName: "Ingresos",
    kind: "INCOME",
    total: s27 + s28,
    values: [mkVal("s27", s27), mkVal("s28", s28)],
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
        values: [mkVal("s27", s27), mkVal("s28", s28)],
      } as ProjectionRow["items"][number],
    ],
  };
}

describe("applyOptimisticHides", () => {
  it("vacía la celda ocultada (amount 0, sin ids) y ajusta el bucket-sum de la fila", () => {
    const rows = [row("i1", 1000, 500)];
    const out = applyOptimisticHides(rows, [{ itemId: "i1", bucketKey: "s27" }]);
    const it = out[0].items[0];
    expect(it.values.find((v) => v.bucketKey === "s27")?.amount).toBe(0);
    expect(it.values.find((v) => v.bucketKey === "s27")?.occurrenceId).toBeNull();
    // La otra celda intacta.
    expect(it.values.find((v) => v.bucketKey === "s28")?.amount).toBe(500);
    // Bucket-sum de la fila refleja el vaciado.
    expect(out[0].values.find((v) => v.bucketKey === "s27")?.amount).toBe(0);
  });

  it("es idempotente: una celda ya en 0 no cambia", () => {
    const rows = [row("i1", 0, 500)];
    const out = applyOptimisticHides(rows, [{ itemId: "i1", bucketKey: "s27" }]);
    expect(out[0].values.find((v) => v.bucketKey === "s27")?.amount).toBe(0);
    expect(out[0].values.find((v) => v.bucketKey === "s28")?.amount).toBe(500);
  });

  it("no toca filas de otros items", () => {
    const rows = [row("i1", 1000, 0), row("i2", 2000, 0)];
    const out = applyOptimisticHides(rows, [{ itemId: "i1", bucketKey: "s27" }]);
    expect(out[1].items[0].values.find((v) => v.bucketKey === "s27")?.amount).toBe(2000);
  });
});

describe("applyOptimisticAmounts", () => {
  it("fija el nuevo monto y ajusta el bucket-sum por el delta", () => {
    const rows = [row("i1", 1000, 500)];
    const out = applyOptimisticAmounts(rows, [
      { itemId: "i1", bucketKey: "s27", amount: 1800 },
    ]);
    const it = out[0].items[0];
    expect(it.values.find((v) => v.bucketKey === "s27")?.amount).toBe(1800);
    // Mantiene el occurrenceId (sigue editable/arrastrable).
    expect(it.values.find((v) => v.bucketKey === "s27")?.occurrenceId).toBe("occ-s27");
    // Bucket-sum sube por el delta (+800).
    expect(out[0].values.find((v) => v.bucketKey === "s27")?.amount).toBe(1800);
  });

  it("sin pendientes devuelve las filas tal cual", () => {
    const rows = [row("i1", 1000, 500)];
    expect(applyOptimisticAmounts(rows, [])).toBe(rows);
  });
});
