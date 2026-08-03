import { describe, it, expect } from "vitest";
import { assembleMatrix, type AssembleRowInput } from "../matrix-assemble";
import { reduceMonthly } from "../matrix-monthly";
import type { CommittedByRow, RealByRow } from "../types";

const WEEKS = ["2026-07-06", "2026-07-13", "2026-07-20", "2026-07-27", "2026-08-03"];
const CURRENT = "2026-07-20";

function row(over: Partial<AssembleRowInput>): AssembleRowInput {
  return {
    id: "r1", name: "Fila", section: "INGRESOS", mapping: "MANUAL", orderIndex: 0,
    crmAccountId: null, installationId: null, categoryId: null, supplierId: null,
    isArchived: false, archivedWeekCutoff: null, isVirtual: false,
    ...over,
  };
}

const committedOf = (rowId: string, week: string, total: number): CommittedByRow =>
  new Map([[rowId, new Map([[week, { total, items: [] }]])]]);
const realOf = (rowId: string, week: string, total: number): RealByRow =>
  new Map([[rowId, new Map([[week, { total, items: [] }]])]]);

describe("assembleMatrix — capa efectiva", () => {
  it("real > plan manual > comprometido; semanas pasadas solo real", () => {
    const rows = [row({})];
    const m = assembleMatrix({
      rows, weeks: WEEKS, currentWeek: CURRENT, openingBalance: 10_000_000,
      plan: new Map([["r1", new Map([["2026-07-06", 500], ["2026-07-27", 800]])]]),
      committed: committedOf("r1", "2026-07-27", 1000),
      real: realOf("r1", "2026-07-13", 700),
    });
    const cells = m.rows[0].cells;
    // Semana pasada con plan pero sin real → efectivo 0 (no cae al plan).
    expect(cells[0]).toMatchObject({ layer: "empty", effective: 0, plan: 500 });
    // Semana pasada con real.
    expect(cells[1]).toMatchObject({ layer: "real", effective: 700 });
    // Futura: plan manual pisa la proyección comprometida.
    expect(cells[3]).toMatchObject({ layer: "plan", effective: 800, plan: 800 });
  });

  it("ingreso facturado (DTE) pisa al plan manual", () => {
    const rows = [row({ section: "INGRESOS" })];
    const committed: CommittedByRow = new Map([
      [
        "r1",
        new Map([
          [
            "2026-07-27",
            {
              total: 1000,
              items: [
                {
                  kind: "dte",
                  dteId: "d1",
                  folio: 123,
                  label: "Cli",
                  fecha: "2026-07-28",
                  monto: 1000,
                },
              ],
            },
          ],
        ]),
      ],
    ]);
    const m = assembleMatrix({
      rows,
      weeks: WEEKS,
      currentWeek: CURRENT,
      openingBalance: 0,
      plan: new Map([["r1", new Map([["2026-07-27", 800]])]]),
      committed,
      real: new Map(),
    });
    expect(m.rows[0].cells[3]).toMatchObject({
      layer: "committed",
      effective: 1000,
      plan: 800,
    });
  });

  it("egreso programado (sueldos) cede al plan manual", () => {
    const rows = [row({ id: "rem", section: "REMUNERACIONES" })];
    const committed: CommittedByRow = new Map([
      [
        "rem",
        new Map([
          [
            "2026-07-27",
            {
              total: 103_962_638,
              items: [
                {
                  kind: "scheduled",
                  label: "Sueldos líquidos",
                  fecha: "2026-08-05",
                  monto: 103_962_638,
                },
              ],
            },
          ],
        ]),
      ],
    ]);
    const m = assembleMatrix({
      rows,
      weeks: WEEKS,
      currentWeek: CURRENT,
      openingBalance: 0,
      plan: new Map([["rem", new Map([["2026-07-27", 70_000_000]])]]),
      committed,
      real: new Map(),
    });
    // Egreso: plan cash-signed negativo.
    expect(m.rows[0].cells[3]).toMatchObject({
      layer: "plan",
      effective: -70_000_000,
      plan: 70_000_000,
    });
  });

  it("egresos restan y FINANCIAMIENTO respeta el signo del plan", () => {
    const rows = [
      row({ id: "ing", section: "INGRESOS" }),
      row({ id: "gav", section: "GAV" }),
      row({ id: "fin", section: "FINANCIAMIENTO" }),
    ];
    const m = assembleMatrix({
      rows, weeks: WEEKS, currentWeek: CURRENT, openingBalance: 0,
      plan: new Map([
        ["ing", new Map([["2026-07-27", 1_000]])],
        ["gav", new Map([["2026-07-27", 400]])],
        ["fin", new Map([["2026-07-27", -300]])],
      ]),
      committed: new Map(),
      real: new Map(),
    });
    expect(m.flows[3]).toBe(1_000 - 400 - 300);
  });
});

describe("assembleMatrix — saldo acumulado", () => {
  it("ancla en saldo hoy + pendiente de la semana; futuro acumula; pasado des-acumula real", () => {
    const rows = [row({ id: "ing" }), row({ id: "gav", section: "GAV" })];
    const m = assembleMatrix({
      rows, weeks: WEEKS, currentWeek: CURRENT, openingBalance: 10_000,
      plan: new Map([["ing", new Map([["2026-08-03", 2_000]])]]),
      // Comprometido de la semana actual (pendiente de cobro).
      committed: committedOf("ing", "2026-07-20", 1_000),
      // Real de la semana pasada (ya está dentro del saldo de hoy).
      real: realOf("ing", "2026-07-13", 5_000),
    });
    // Semana actual: 10.000 + 1.000 pendiente.
    expect(m.balances[2]).toBe(11_000);
    // Semana anterior: cerró antes del abono de 5.000 de la semana 13? No:
    // el abono fue EN la semana del 13 → fin de semana 13 = saldo hoy (10.000),
    // fin de semana 06 = 10.000 − 5.000.
    expect(m.balances[1]).toBe(10_000);
    expect(m.balances[0]).toBe(5_000);
    // Futuras: 27-jul sin nada (11.000), 03-ago +2.000 plan.
    expect(m.balances[3]).toBe(11_000);
    expect(m.balances[4]).toBe(13_000);
    expect(m.kpis.minBalance).toBe(11_000);
    expect(m.balanceBreaks.every((b) => b == null)).toBe(true);
  });

  it("sin sellos: balances idénticos al comportamiento previo (byte a byte)", () => {
    const rows = [row({ id: "ing" })];
    const args = {
      rows, weeks: WEEKS, currentWeek: CURRENT, openingBalance: 4_696_418,
      plan: new Map() as Map<string, Map<string, number>>,
      committed: committedOf("ing", "2026-07-20", 100),
      real: realOf("ing", "2026-07-13", 50_000),
    };
    const m = assembleMatrix(args);
    const mEmpty = assembleMatrix({ ...args, sealedBalances: new Map() });
    expect(mEmpty.balances).toEqual(m.balances);
  });

  it("un sello manda: ancla su semana, atrás deriva, adelante encadena (no banco-hoy)", () => {
    // WEEKS[0..4]; CURRENT = index 2. Sello en index 1 = 28_455_846.
    const rows = [row({ id: "ing" })];
    const sealed = new Map([["2026-07-13", 28_455_846]]);
    const m = assembleMatrix({
      rows, weeks: WEEKS, currentWeek: CURRENT, openingBalance: 10_000,
      plan: new Map([["ing", new Map([["2026-07-27", 2_000]])]]),
      committed: committedOf("ing", "2026-07-20", 500),
      real: realOf("ing", "2026-07-13", 5_000),
      sealedBalances: sealed,
    });
    expect(m.balances[1]).toBe(28_455_846);
    // Atrás: 28_455_846 − realNet[1].
    expect(m.balances[0]).toBe(28_450_846);
    // Adelante: sello + flujo semana actual (comprometido 500), NO banco-hoy.
    expect(m.balances[2]).toBe(28_455_846 + 500);
    expect(m.balances[3]).toBe(28_455_846 + 500 + 2_000);
    // Sin ⚠: la cadena desde el sello es continua.
    expect(m.balanceBreaks.every((b) => b == null)).toBe(true);
  });

  it("dos sellos: cada uno manda; ⚠ solo si el segundo no cuadra con el primero+flujos", () => {
    const rows = [row({ id: "ing" })];
    const sealed = new Map([
      ["2026-07-06", 1_000_000],
      ["2026-07-13", 28_455_846],
    ]);
    const m = assembleMatrix({
      rows, weeks: WEEKS, currentWeek: CURRENT, openingBalance: 4_696_418,
      plan: new Map(),
      committed: committedOf("ing", "2026-07-20", 100),
      real: (() => {
        const map: RealByRow = new Map([
          ["ing", new Map([
            ["2026-07-06", { total: 100, items: [] }],
            ["2026-07-13", { total: 200, items: [] }],
            ["2026-07-20", { total: 0, items: [] }],
          ])],
        ]);
        return map;
      })(),
      sealedBalances: sealed,
    });
    expect(m.balances[0]).toBe(1_000_000);
    expect(m.balances[1]).toBe(28_455_846);
    // Adelante desde el último sello (idx 1): actual = sello + 100.
    expect(m.balances[2]).toBe(28_455_846 + 100);
    // Dos sellos que no cuadran → ⚠ en el segundo.
    expect(m.balanceBreaks[1]).toMatchObject({ vsWeek: "2026-07-06" });
    expect(Math.abs(m.balanceBreaks[1]!.delta)).toBeGreaterThan(1);
    // La semana actual encadenada NO lleva ⚠.
    expect(m.balanceBreaks[2]).toBeNull();
  });

  it("caso Carlos: S31 sellada 28.455.846 → S32 = sello + flujo (sin ⚠)", () => {
    // S31 = 2026-07-27 (idx 3), S32 = 2026-08-03 (idx 4) = current.
    const rows = [row({ id: "ing" }), row({ id: "gav", section: "GAV" })];
    const sealed = new Map([["2026-07-27", 28_455_846]]);
    const m = assembleMatrix({
      rows,
      weeks: WEEKS,
      currentWeek: "2026-08-03",
      openingBalance: 4_696_418, // banco-hoy distinto; NO debe anclar Saldo
      plan: new Map(),
      committed: new Map([
        ["ing", new Map([["2026-08-03", { total: 1_000_000, items: [] }]])],
        ["gav", new Map([["2026-08-03", { total: 200_000, items: [] }]])],
      ]),
      real: new Map(),
      sealedBalances: sealed,
    });
    expect(m.balances[3]).toBe(28_455_846);
    // Flujo S32 = +1_000_000 − 200_000 = +800_000
    expect(m.flows[4]).toBe(800_000);
    expect(m.balances[4]).toBe(28_455_846 + 800_000);
    expect(m.balanceBreaks.every((b) => b == null)).toBe(true);
  });

  it("fila archivada vacía sus celdas posteriores al cutoff", () => {
    const rows = [row({ id: "r1", isArchived: true, archivedWeekCutoff: "2026-07-13" })];
    const m = assembleMatrix({
      rows, weeks: WEEKS, currentWeek: CURRENT, openingBalance: 0,
      plan: new Map([["r1", new Map([["2026-07-27", 900]])]]),
      committed: committedOf("r1", "2026-07-27", 700),
      real: realOf("r1", "2026-07-13", 300),
    });
    const cells = m.rows[0].cells;
    expect(cells[1]).toMatchObject({ layer: "real", effective: 300 });
    expect(cells[3]).toMatchObject({ layer: "empty", plan: 0, committed: null });
  });
});

describe("reduceMonthly", () => {
  it("agrupa por mes del lunes, suma flujos y toma el último saldo", () => {
    const rows = [row({})];
    const m = assembleMatrix({
      rows, weeks: WEEKS, currentWeek: CURRENT, openingBalance: 100,
      plan: new Map([["r1", new Map([["2026-07-27", 50], ["2026-08-03", 70]])]]),
      committed: new Map(),
      real: new Map(),
    });
    const r = reduceMonthly(WEEKS, CURRENT, m);
    expect(r.columns.map((c) => c.key)).toEqual(["2026-07", "2026-08"]);
    expect(r.columns[0].weekCount).toBe(4);
    expect(r.flows).toEqual([50, 70]);
    expect(r.balances).toEqual([150, 220]);
    expect(r.rows[0].cells[0].plan).toBe(50);
  });
});
