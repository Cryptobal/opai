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
  it("real > comprometido > plan; semanas pasadas solo real", () => {
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
    // Futura: comprometido pisa al plan (que queda visible para desvío).
    expect(cells[3]).toMatchObject({ layer: "committed", effective: 1000, plan: 800 });
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
