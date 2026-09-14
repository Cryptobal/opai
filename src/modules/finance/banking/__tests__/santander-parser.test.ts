import { describe, expect, it } from "vitest";
import { parseDailyBalancesBlock, parseSantanderCartola } from "../santander-parser";

type Row = (string | number | null)[];

function cartola(footer: Row[]): Row[] {
  return [
    ["Cuenta Corriente N 0-000-9454115-8", null, null, null, null, null, null, null],
    ["Moneda: PESOS DE CHILE"],
    ["Fecha desde: 01/09/2026", null, "Fecha hasta: 14/09/2026"],
    ["SALDO INICIAL", "DEPÓSITOS", "OTROS ABONOS", "CHEQUES", "OTROS CARGOS", "IMPUESTOS", "SALDO FINAL", ""],
    [26_752_990, 0, 144_099_749, 0, -147_515_775, -906, 23_336_058, ""],
    ["MONTO", "DESCRIPCION", "", "FECHA", "N DOC", "SUCURSAL", "", "CARGO/ABONO"],
    [303_768, "Transf. Contrato Josue", "", "07/09/2026", "000000000", "Internet", "", "A"],
    [303_768, "Transf. Contrato Josue", "", "07/09/2026", "000000000", "Internet", "", "A"],
    [-7_000_000, "Transf. SCF SERVICIOS F", "", "07/09/2026", "77460259", "Internet", "", "C"],
    ["", "Saldos diarios"],
    ...footer,
  ];
}

describe("parseSantanderCartola", () => {
  it("conserva las dos filas idénticas (dos transferencias reales) y lee saldo inicial/final", () => {
    const parsed = parseSantanderCartola(cartola([]));
    expect(parsed.transactions).toHaveLength(3);
    expect(parsed.transactions[0]!.reference).toBeNull(); // 000000000 → null
    expect(parsed.openingBalance).toBe(26_752_990);
    expect(parsed.closingBalance).toBe(23_336_058);
    expect(parsed.periodFrom).toBe("2026-09-01");
    expect(parsed.periodTo).toBe("2026-09-14");
  });

  it("lee el bloque Saldos diarios con [fecha, saldo]", () => {
    const parsed = parseSantanderCartola(
      cartola([
        ["", "FECHA", "SALDO"],
        ["", "12/09/2026", 31_234_701],
        ["", "13/09/2026", "20.634.054"],
        ["", "14/09/2026", 23_336_058],
      ]),
    );
    expect(parsed.dailyBalances).toEqual([
      { date: "2026-09-12", balance: 31_234_701 },
      { date: "2026-09-13", balance: 20_634_054 },
      { date: "2026-09-14", balance: 23_336_058 },
    ]);
  });

  it("lee el bloque Saldos diarios con [saldo, fecha] (columnas invertidas)", () => {
    const parsed = parseSantanderCartola(
      cartola([
        [31_234_701, "12/09/2026"],
        [20_634_054, "13/09/2026"],
      ]),
    );
    expect(parsed.dailyBalances.map((d) => d.balance)).toEqual([31_234_701, 20_634_054]);
  });

  it("sin SALDO FINAL explícito usa el saldo diario de la fecha hasta", () => {
    const rows = cartola([
      ["", "13/09/2026", 20_634_054],
      ["", "14/09/2026", 23_336_058],
    ]).filter((r) => String(r[0]).toUpperCase() !== "SALDO INICIAL" && r[0] !== 26_752_990);
    const parsed = parseSantanderCartola(rows);
    expect(parsed.closingBalance).toBe(23_336_058);
  });
});

describe("parseDailyBalancesBlock", () => {
  it("ignora filas rotuladas y termina al acabarse las fechas", () => {
    const rows: Row[] = [
      ["", "Saldos diarios"],
      ["", "FECHA", "SALDO"],
      ["", "12/09/2026", 100],
      ["", "12/09/2026", 100], // repetida → una sola
      ["", "SALDO FINAL", 100],
      ["", "13/09/2026", 200],
      ["Firmado electrónicamente"],
      ["", "14/09/2026", 300], // después del corte no se lee
    ];
    expect(parseDailyBalancesBlock(rows, 1)).toEqual([
      { date: "2026-09-12", balance: 100 },
      { date: "2026-09-13", balance: 200 },
    ]);
  });
});
