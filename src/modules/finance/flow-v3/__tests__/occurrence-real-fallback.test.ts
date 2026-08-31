import { describe, it, expect } from "vitest";
import {
  mergeOccurrenceLinksIntoTxs,
  resolveRowIdForOccurrence,
} from "../occurrence-real-fallback";
import type { FlowRowRef, RealTxInput } from "../types";

const ROWS: Pick<FlowRowRef, "id" | "name" | "categoryId">[] = [
  { id: "row-retiro", name: "Retiro socios", categoryId: "cat-retiro" },
  { id: "row-te", name: "Turnos extra", categoryId: "cat-te" },
];

describe("resolveRowIdForOccurrence", () => {
  it("prioriza categoryId", () => {
    expect(
      resolveRowIdForOccurrence(
        { bankTransactionId: "tx-1", categoryId: "cat-retiro", itemName: "Otra cosa" },
        ROWS,
      ),
    ).toBe("row-retiro");
  });

  it("matchea 'Retiro socios 2026-08' por prefijo de fila", () => {
    expect(
      resolveRowIdForOccurrence(
        { bankTransactionId: "tx-1", categoryId: null, itemName: "Retiro socios 2026-08" },
        ROWS,
      ),
    ).toBe("row-retiro");
  });

  it("sin match → null", () => {
    expect(
      resolveRowIdForOccurrence(
        { bankTransactionId: "tx-1", categoryId: "cat-x", itemName: "Desconocido" },
        ROWS,
      ),
    ).toBeNull();
  });
});

describe("mergeOccurrenceLinksIntoTxs", () => {
  it("no pisa txs que ya tienen links", () => {
    const txs: RealTxInput[] = [
      {
        id: "tx-1",
        dateYmd: "2026-08-31",
        amountClp: -5_000_000,
        description: "Transf",
        links: [
          {
            targetType: "EXPENSE",
            targetId: null,
            amountClp: 5_000_000,
            accountPlanId: "plan-1",
            flowRowId: "row-te",
          },
        ],
      },
    ];
    mergeOccurrenceLinksIntoTxs(
      txs,
      [{ bankTransactionId: "tx-1", categoryId: "cat-retiro", itemName: "Retiro socios" }],
      ROWS,
    );
    expect(txs[0]!.links).toHaveLength(1);
    expect(txs[0]!.links[0]!.flowRowId).toBe("row-te");
  });

  it("sintetiza EXPENSE + flowRowId Retiro socios para cargo sin links", () => {
    const txs: RealTxInput[] = [
      {
        id: "tx-5m",
        dateYmd: "2026-08-31",
        amountClp: -5_000_000,
        description: "Transf. Internet a 5.529.466-6",
        links: [],
      },
    ];
    mergeOccurrenceLinksIntoTxs(
      txs,
      [
        {
          bankTransactionId: "tx-5m",
          categoryId: "cat-retiro",
          itemName: "Retiro socios 2026-08",
        },
      ],
      ROWS,
    );
    expect(txs[0]!.links).toEqual([
      {
        targetType: "EXPENSE",
        targetId: null,
        amountClp: 5_000_000,
        accountPlanId: null,
        flowRowId: "row-retiro",
      },
    ]);
  });
});
