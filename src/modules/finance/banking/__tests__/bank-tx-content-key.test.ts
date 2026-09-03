import { describe, expect, it } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import {
  amountKey,
  bankTxContentKey,
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
      existingContentKeys: new Set(),
    });
    expect(r.toInsert).toHaveLength(0);
    expect(r.duplicateCount).toBe(1);
  });

  it("salta un id nuevo si la huella ya existe (id inestable)", () => {
    const incoming = mov("new-id");
    const r = partitionInboundMovements({
      incoming: [incoming],
      existingExternalIds: new Set(),
      existingContentKeys: new Set([bankTxContentKey(incoming)]),
    });
    expect(r.toInsert).toHaveLength(0);
    expect(r.duplicateCount).toBe(1);
  });

  it("en un mismo POST deja una sola copia de la misma huella", () => {
    const r = partitionInboundMovements({
      incoming: [mov("id-1"), mov("id-2"), mov("id-3")],
      existingExternalIds: new Set(),
      existingContentKeys: new Set(),
    });
    expect(r.toInsert).toHaveLength(1);
    expect(r.toInsert[0]?.externalId).toBe("id-1");
    expect(r.duplicateCount).toBe(2);
  });

  it("inserta movimientos distintos", () => {
    const r = partitionInboundMovements({
      incoming: [mov("a", 7_000_000), mov("b", 6_464_888)],
      existingExternalIds: new Set(),
      existingContentKeys: new Set(),
    });
    expect(r.toInsert).toHaveLength(2);
    expect(r.duplicateCount).toBe(0);
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
