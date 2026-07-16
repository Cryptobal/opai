import { describe, it, expect } from "vitest";
import type { ProjectionRow } from "@/modules/finance/cashflow/types";
import {
  applyAllPending,
  newPendingId,
  removePendingById,
  type PendingEntry,
} from "../optimistic-move";

function row(itemId: string, amounts: Record<string, number>): ProjectionRow {
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
    values: values.map((v) => ({ bucketKey: v.bucketKey, amount: v.amount })),
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
        values,
        total: values.reduce((s, v) => s + v.amount, 0),
        totalActual: 0,
      },
    ],
  };
}

describe("mutations-queue (pending por id)", () => {
  it("dos amounts consecutivos coexisten en la cola", () => {
    const id1 = newPendingId();
    const id2 = newPendingId();
    const pending: PendingEntry[] = [
      { id: id1, kind: "amount", itemId: "a", bucketKey: "W27", amount: 111 },
      { id: id2, kind: "amount", itemId: "b", bucketKey: "W28", amount: 222 },
    ];
    const rows = [row("a", { W27: 100, W28: 0 }), row("b", { W27: 0, W28: 200 })];
    const out = applyAllPending(rows, pending);
    expect(out[0].items[0].values.find((v) => v.bucketKey === "W27")?.amount).toBe(
      111,
    );
    expect(out[1].items[0].values.find((v) => v.bucketKey === "W28")?.amount).toBe(
      222,
    );
  });

  it("resolver el primero no borra el segundo", () => {
    const id1 = newPendingId();
    const id2 = newPendingId();
    let pending: PendingEntry[] = [
      { id: id1, kind: "amount", itemId: "a", bucketKey: "W27", amount: 111 },
      { id: id2, kind: "amount", itemId: "b", bucketKey: "W28", amount: 222 },
    ];
    pending = removePendingById(pending, id1);
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe(id2);
    expect(pending[0].kind).toBe("amount");
    if (pending[0].kind === "amount") expect(pending[0].amount).toBe(222);
  });

  it("error en uno revierte solo ese (remove por id)", () => {
    const idOk = newPendingId();
    const idFail = newPendingId();
    let pending: PendingEntry[] = [
      { id: idOk, kind: "amount", itemId: "a", bucketKey: "W27", amount: 111 },
      { id: idFail, kind: "hide", itemId: "b", bucketKey: "W28" },
    ];
    // Simula error en hide → se remueve solo idFail; la UI vuelve al cacheado
    // para esa celda, el amount sigue pendiente.
    pending = removePendingById(pending, idFail);
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe(idOk);

    const rows = [row("a", { W27: 100 }), row("b", { W28: 500 })];
    const out = applyAllPending(rows, pending);
    expect(out[0].items[0].values.find((v) => v.bucketKey === "W27")?.amount).toBe(
      111,
    );
    // b sin hide pendiente → monto original
    expect(out[1].items[0].values.find((v) => v.bucketKey === "W28")?.amount).toBe(
      500,
    );
  });
});
