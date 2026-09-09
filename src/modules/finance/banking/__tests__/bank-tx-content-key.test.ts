import { describe, expect, it } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import {
  amountKey,
  bankTxContentKey,
  contentDuplicateGroupKey,
  partitionInboundMovements,
  pickContentDuplicateKeeper,
  pickLatestBalanceHint,
} from "../bank-tx-content-key";

describe("bankTxContentKey", () => {
  it("normaliza monto y fecha para que CSV y API coincidan", () => {
    const fromApi = bankTxContentKey({
      transactionDate: "2026-08-04",
      amount: 7_000_000,
      description: "  SCF SERVICIOS F ",
      reference: "77460259-3",
    });
    const fromDb = bankTxContentKey({
      transactionDate: new Date("2026-08-04T00:00:00.000Z"),
      amount: new Decimal("7000000.00"),
      description: "SCF SERVICIOS F",
      reference: "77460259-3",
    });
    expect(fromApi).toBe(fromDb);
    expect(amountKey(7000000)).toBe("7000000.00");
  });

  it("distingue montos distintos el mismo día", () => {
    const a = bankTxContentKey({
      transactionDate: "2026-08-04",
      amount: 7_000_000,
      description: "SCF",
      reference: "x",
    });
    const b = bankTxContentKey({
      transactionDate: "2026-08-04",
      amount: 6_464_888,
      description: "SCF",
      reference: "x",
    });
    expect(a).not.toBe(b);
  });
});

describe("partitionInboundMovements", () => {
  const mov = (
    id: string,
    amount = 7_000_000,
    date = "2026-08-04",
  ): {
    externalId: string;
    transactionDate: string;
    description: string;
    reference: string;
    amount: number;
  } => ({
    externalId: id,
    transactionDate: date,
    description: "SCF SERVICIOS F",
    reference: "77460259-3",
    amount,
  });

  it("salta el mismo externalId", () => {
    const r = partitionInboundMovements({
      incoming: [mov("a")],
      existingExternalIds: new Set(["a"]),
      existingContentCounts: new Map(),
    });
    expect(r.toInsert).toHaveLength(0);
    expect(r.duplicateCount).toBe(1);
  });

  it("7 items idénticos con 7 ids se insertan las 7", () => {
    const r = partitionInboundMovements({
      incoming: [mov("id-1"), mov("id-2"), mov("id-3"), mov("id-4"), mov("id-5"), mov("id-6"), mov("id-7")],
      existingExternalIds: new Set(),
      existingContentCounts: new Map(),
    });
    expect(r.toInsert).toHaveLength(7);
    expect(r.duplicateCount).toBe(0);
  });

  it("reenvío completo del lote → 0 inserciones", () => {
    const ids = ["id-1", "id-2", "id-3", "id-4", "id-5", "id-6", "id-7"];
    const r = partitionInboundMovements({
      incoming: ids.map((id) => mov(id)),
      existingExternalIds: new Set(ids),
      existingContentCounts: new Map([
        [bankTxContentKey(mov("id-1")), 7],
      ]),
    });
    expect(r.toInsert).toHaveLength(0);
    expect(r.duplicateCount).toBe(7);
  });

  it("subconjunto con ids ya vistos → 0", () => {
    const r = partitionInboundMovements({
      incoming: [mov("id-1"), mov("id-2"), mov("id-3")],
      existingExternalIds: new Set(["id-1", "id-2", "id-3", "id-4"]),
      existingContentCounts: new Map([[bankTxContentKey(mov("id-1")), 4]]),
    });
    expect(r.toInsert).toHaveLength(0);
  });

  it("ids nuevos de un día ya cubierto por conteo no duplican", () => {
    const key = bankTxContentKey(mov("x"));
    const r = partitionInboundMovements({
      incoming: [mov("new-a"), mov("new-b")],
      existingExternalIds: new Set(),
      existingContentCounts: new Map([[key, 7]]),
    });
    expect(r.toInsert).toHaveLength(0);
  });

  it("6 ids nuevos cuando ya hay 1 fila visible → inserta 6 (caso SCF)", () => {
    const key = bankTxContentKey(mov("x"));
    const r = partitionInboundMovements({
      incoming: [
        mov("keep"),
        mov("miss-1"),
        mov("miss-2"),
        mov("miss-3"),
        mov("miss-4"),
        mov("miss-5"),
        mov("miss-6"),
      ],
      existingExternalIds: new Set(["keep"]),
      existingContentCounts: new Map([[key, 1]]),
    });
    expect(r.toInsert).toHaveLength(6);
    expect(r.toInsert.map((m) => m.externalId)).toEqual([
      "miss-1",
      "miss-2",
      "miss-3",
      "miss-4",
      "miss-5",
      "miss-6",
    ]);
  });

  it("CSV sin id: 1 por huella aunque el lote traiga copias", () => {
    const r = partitionInboundMovements({
      incoming: [mov(""), mov(""), mov("")],
      existingExternalIds: new Set(),
      existingContentCounts: new Map(),
    });
    expect(r.toInsert).toHaveLength(1);
    expect(r.duplicateCount).toBe(2);
  });

  it("CSV sin id: no inserta si la huella ya está en BD", () => {
    const incoming = mov("");
    const r = partitionInboundMovements({
      incoming: [incoming],
      existingExternalIds: new Set(),
      existingContentCounts: new Map([[bankTxContentKey(incoming), 1]]),
    });
    expect(r.toInsert).toHaveLength(0);
  });

  it("inserta movimientos distintos", () => {
    const r = partitionInboundMovements({
      incoming: [mov("a", 7_000_000), mov("b", 6_464_888)],
      existingExternalIds: new Set(),
      existingContentCounts: new Map(),
    });
    expect(r.toInsert).toHaveLength(2);
    expect(r.duplicateCount).toBe(0);
  });
});

describe("contentDuplicateGroupKey", () => {
  it("separa ids de proveedor distintos", () => {
    const base = {
      transactionDate: "2026-09-07",
      amount: 7_000_000,
      description: "SCF",
      reference: "x",
    };
    expect(contentDuplicateGroupKey({ ...base, apiTransactionId: "web4leads:a" })).not.toBe(
      contentDuplicateGroupKey({ ...base, apiTransactionId: "web4leads:b" }),
    );
    expect(contentDuplicateGroupKey({ ...base, apiTransactionId: null })).toBe(
      contentDuplicateGroupKey({ ...base, apiTransactionId: null }),
    );
  });
});

describe("pickLatestBalanceHint", () => {
  it("elige el saldo del movimiento más reciente", () => {
    const hint = pickLatestBalanceHint([
      {
        externalId: "1",
        transactionDate: "2026-09-02",
        description: "a",
        amount: -100,
        balance: 8_000_000,
      },
      {
        externalId: "2",
        transactionDate: "2026-09-03",
        description: "b",
        amount: -40_000,
        balance: 7_514_145,
      },
    ]);
    expect(hint).toEqual({ asOfDate: "2026-09-03", balance: 7_514_145 });
  });

  it("sin balance retorna null", () => {
    expect(
      pickLatestBalanceHint([
        {
          externalId: "1",
          transactionDate: "2026-09-03",
          description: "a",
          amount: -100,
        },
      ]),
    ).toBeNull();
  });
});

describe("pickContentDuplicateKeeper", () => {
  it("prefiere MATCHED aunque sea más nuevo", () => {
    const id = pickContentDuplicateKeeper([
      {
        id: "old-unmatched",
        createdAt: new Date("2026-08-04T17:00:00Z"),
        reconciliationStatus: "UNMATCHED",
      },
      {
        id: "matched",
        createdAt: new Date("2026-08-04T18:00:00Z"),
        reconciliationStatus: "MATCHED",
      },
    ]);
    expect(id).toBe("matched");
  });

  it("si todos UNMATCHED, conserva el más antiguo", () => {
    const id = pickContentDuplicateKeeper([
      {
        id: "b",
        createdAt: new Date("2026-07-09T20:46:41.432Z"),
        reconciliationStatus: "UNMATCHED",
      },
      {
        id: "a",
        createdAt: new Date("2026-07-09T20:46:41.432Z"),
        reconciliationStatus: "UNMATCHED",
      },
    ]);
    expect(id).toBe("a");
  });
});
