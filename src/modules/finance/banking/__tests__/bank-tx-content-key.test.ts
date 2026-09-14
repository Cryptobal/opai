import { describe, expect, it } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import {
  amountKey,
  bankTxContentKey,
  contentDuplicateGroupKey,
  partitionInboundMovements,
  pickContentDuplicateKeeper,
  pickLatestBalanceHint,
  type ExistingContentRow,
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
    balance: number | null = null,
  ) => ({
    externalId: id,
    transactionDate: date,
    description: "SCF SERVICIOS F",
    reference: "77460259-3",
    amount,
    balance,
  });
  const rows = (...r: ExistingContentRow[]) =>
    new Map([[bankTxContentKey(mov("x")), r]]);

  it("salta el mismo externalId", () => {
    const r = partitionInboundMovements({
      incoming: [mov("a")],
      existingExternalIds: new Set(["a"]),
      existingContentRows: new Map(),
    });
    expect(r.toInsert).toHaveLength(0);
    expect(r.duplicateCount).toBe(1);
  });

  it("7 items idénticos con 7 ids en un POST se insertan las 7 (sin descartar)", () => {
    const r = partitionInboundMovements({
      incoming: ["1", "2", "3", "4", "5", "6", "7"].map((i) => mov(`id-${i}`)),
      existingExternalIds: new Set(),
      existingContentRows: new Map(),
    });
    expect(r.toInsert).toHaveLength(7);
    expect(r.duplicateCount).toBe(0);
    expect(r.toInsert.every((p) => p.dupSuspectOfId === null)).toBe(true);
  });

  it("reenvío completo del lote (mismos ids) → 0 inserciones", () => {
    const ids = ["id-1", "id-2", "id-3"];
    const r = partitionInboundMovements({
      incoming: ids.map((id) => mov(id)),
      existingExternalIds: new Set(ids),
      existingContentRows: rows({ id: "a", balance: null }, { id: "b", balance: null }, { id: "c", balance: null }),
    });
    expect(r.toInsert).toHaveLength(0);
    expect(r.duplicateCount).toBe(3);
  });

  it("idéntica ya guardada + id nuevo + sin saldo: se inserta marcada como posible duplicado", () => {
    const r = partitionInboundMovements({
      incoming: [mov("new-id")],
      existingExternalIds: new Set(),
      existingContentRows: rows({ id: "db-row", balance: null }),
    });
    expect(r.toInsert).toHaveLength(1);
    expect(r.toInsert[0]!.dupSuspectOfId).toBe("db-row");
    expect(r.suspectCount).toBe(1);
    expect(r.duplicateCount).toBe(0);
  });

  it("idéntica en otro webhook con el MISMO saldo tras el movimiento → es la misma operación (duplicado)", () => {
    const r = partitionInboundMovements({
      incoming: [mov("new-id", 7_000_000, "2026-08-04", 25_000_000)],
      existingExternalIds: new Set(),
      existingContentRows: rows({ id: "db-row", balance: 25_000_000 }),
    });
    expect(r.toInsert).toHaveLength(0);
    expect(r.duplicateCount).toBe(1);
  });

  it("idéntica en otro webhook con saldo DISTINTO → segunda transferencia real, sin marca", () => {
    const r = partitionInboundMovements({
      incoming: [mov("new-id", 7_000_000, "2026-08-04", 32_000_000)],
      existingExternalIds: new Set(),
      existingContentRows: rows({ id: "db-row", balance: 25_000_000 }),
    });
    expect(r.toInsert).toHaveLength(1);
    expect(r.toInsert[0]!.dupSuspectOfId).toBeNull();
    expect(r.suspectCount).toBe(0);
  });

  it("copias en el mismo lote con el mismo saldo se descartan; saldos distintos se insertan", () => {
    const r = partitionInboundMovements({
      incoming: [
        mov("a", 7_000_000, "2026-08-04", 10_000_000),
        mov("b", 7_000_000, "2026-08-04", 10_000_000), // copia
        mov("c", 7_000_000, "2026-08-04", 17_000_000), // segunda transferencia real
      ],
      existingExternalIds: new Set(),
      existingContentRows: new Map(),
    });
    expect(r.toInsert.map((p) => p.movement.externalId)).toEqual(["a", "c"]);
    expect(r.duplicateCount).toBe(1);
  });

  it("CSV sin id: inserta apariciones del archivo − filas ya guardadas", () => {
    const r = partitionInboundMovements({
      incoming: [mov(""), mov(""), mov("")],
      existingExternalIds: new Set(),
      existingContentRows: rows({ id: "db-1", balance: null }),
    });
    expect(r.toInsert).toHaveLength(2);
    expect(r.duplicateCount).toBe(1);
  });

  it("CSV sin id: reimportar el mismo archivo no inserta nada", () => {
    const r = partitionInboundMovements({
      incoming: [mov(""), mov("")],
      existingExternalIds: new Set(),
      existingContentRows: rows({ id: "db-1", balance: null }, { id: "db-2", balance: null }),
    });
    expect(r.toInsert).toHaveLength(0);
  });

  it("inserta movimientos distintos", () => {
    const r = partitionInboundMovements({
      incoming: [mov("a", 7_000_000), mov("b", 6_464_888)],
      existingExternalIds: new Set(),
      existingContentRows: new Map(),
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
  it("elige el saldo del movimiento de fecha más reciente", () => {
    const hint = pickLatestBalanceHint([
      { externalId: "1", transactionDate: "2026-09-02", description: "a", amount: -100, balance: 8_000_000 },
      { externalId: "2", transactionDate: "2026-09-03", description: "b", amount: -40_000, balance: 7_514_145 },
    ]);
    expect(hint).toEqual({ asOfDate: "2026-09-03", balance: 7_514_145 });
  });

  it("mismo día en orden DESCENDENTE: sigue la cadena de saldos y elige el último real", () => {
    // Cronología real: 20.634.054 → +5.893.845 = 26.527.899 → +3.885.711 = 30.413.610.
    const hint = pickLatestBalanceHint([
      { externalId: "b", transactionDate: "2026-09-14", description: "ASAP", amount: 3_885_711, balance: 30_413_610 },
      { externalId: "a", transactionDate: "2026-09-14", description: "AM FACTOR", amount: 5_893_845, balance: 26_527_899 },
    ]);
    expect(hint).toEqual({ asOfDate: "2026-09-14", balance: 30_413_610 });
  });

  it("mismo día en orden ascendente da el mismo resultado", () => {
    const hint = pickLatestBalanceHint([
      { externalId: "a", transactionDate: "2026-09-14", description: "AM FACTOR", amount: 5_893_845, balance: 26_527_899 },
      { externalId: "b", transactionDate: "2026-09-14", description: "ASAP", amount: 3_885_711, balance: 30_413_610 },
    ]);
    expect(hint?.balance).toBe(30_413_610);
  });

  it("sin cadena decidible cae al último del array", () => {
    const hint = pickLatestBalanceHint([
      { externalId: "a", transactionDate: "2026-09-14", description: "x", amount: 1, balance: 100 },
      { externalId: "b", transactionDate: "2026-09-14", description: "y", amount: 1, balance: 500 },
    ]);
    expect(hint?.balance).toBe(500);
  });

  it("sin balance retorna null", () => {
    expect(
      pickLatestBalanceHint([
        { externalId: "1", transactionDate: "2026-09-03", description: "a", amount: -100 },
      ]),
    ).toBeNull();
  });
});

describe("pickContentDuplicateKeeper", () => {
  it("prefiere MATCHED aunque sea más nuevo", () => {
    const id = pickContentDuplicateKeeper([
      { id: "old-unmatched", createdAt: new Date("2026-08-04T17:00:00Z"), reconciliationStatus: "UNMATCHED" },
      { id: "matched", createdAt: new Date("2026-08-04T18:00:00Z"), reconciliationStatus: "MATCHED" },
    ]);
    expect(id).toBe("matched");
  });

  it("si todos UNMATCHED, conserva el más antiguo", () => {
    const id = pickContentDuplicateKeeper([
      { id: "b", createdAt: new Date("2026-07-09T20:46:41.432Z"), reconciliationStatus: "UNMATCHED" },
      { id: "a", createdAt: new Date("2026-07-09T20:46:41.432Z"), reconciliationStatus: "UNMATCHED" },
    ]);
    expect(id).toBe("a");
  });
});
