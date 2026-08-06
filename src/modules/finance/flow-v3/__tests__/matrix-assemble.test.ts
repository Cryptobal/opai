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

  it("semana pasada conserva committed en DTO pero effective/flujo no lo suman", () => {
    const rows = [row({ section: "INGRESOS" })];
    const committed: CommittedByRow = new Map([
      [
        "r1",
        new Map([
          [
            "2026-07-06",
            {
              total: 500_000,
              items: [
                {
                  kind: "dte",
                  dteId: "d-past",
                  folio: 1582,
                  label: "SCRB",
                  fecha: "2026-07-08",
                  monto: 500_000,
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
      openingBalance: 1_000_000,
      plan: new Map(),
      committed,
      real: new Map(),
    });
    const past = m.rows[0].cells[0];
    expect(past).toMatchObject({
      layer: "empty",
      effective: 0,
      weekStart: "2026-07-06",
    });
    expect(past.committed?.total).toBe(500_000);
    expect(past.committed?.items[0]?.folio).toBe(1582);
    // Flujo de semana pasada = solo real (0) — no arrastra el pendiente.
    expect(m.flows[0]).toBe(0);
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

  it("expone projected y drift cuando hay real vs plan", () => {
    const rows = [row({ id: "ing", section: "INGRESOS" })];
    const m = assembleMatrix({
      rows,
      weeks: WEEKS,
      currentWeek: CURRENT,
      openingBalance: 0,
      plan: new Map([["ing", new Map([["2026-07-20", 1_000_000]])]]),
      committed: new Map(),
      real: realOf("ing", "2026-07-20", 1_100_000),
    });
    const cell = m.rows[0].cells[2];
    expect(cell.projected).toBe(1_000_000);
    expect(cell.drift).toMatchObject({ delta: 100_000, pct: 10 });
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

  it("FINANCIAMIENTO comprometido: +mag = egreso; plan pisa; −mag = ingreso", () => {
    const rows = [row({ id: "fin", section: "FINANCIAMIENTO" })];
    // Comprometido +500 → flujo −500 (legado −committed.total).
    const m1 = assembleMatrix({
      rows, weeks: WEEKS, currentWeek: CURRENT, openingBalance: 0,
      plan: new Map(),
      committed: committedOf("fin", "2026-07-27", 500),
      real: new Map(),
    });
    expect(m1.flows[3]).toBe(-500);

    // Comprometido −200 → flujo +200 (ingreso PCT_SALES).
    const mIn = assembleMatrix({
      rows, weeks: WEEKS, currentWeek: CURRENT, openingBalance: 0,
      plan: new Map(),
      committed: committedOf("fin", "2026-07-27", -200),
      real: new Map(),
    });
    expect(mIn.flows[3]).toBe(200);

    // Plan +200 (ingreso) pisa el comprometido.
    const m2 = assembleMatrix({
      rows, weeks: WEEKS, currentWeek: CURRENT, openingBalance: 0,
      plan: new Map([["fin", new Map([["2026-07-27", 200]])]]),
      committed: committedOf("fin", "2026-07-27", 500),
      real: new Map(),
    });
    expect(m2.rows[0]!.cells[3]!.layer).toBe("plan");
    expect(m2.flows[3]).toBe(200);
  });

  it("drift.pct usa magnitud (egreso: delta negativo no invierte el %)", () => {
    const rows = [row({ id: "fin", section: "FINANCIAMIENTO" })];
    const m = assembleMatrix({
      rows,
      weeks: WEEKS,
      currentWeek: CURRENT,
      openingBalance: 0,
      plan: new Map([["fin", new Map([["2026-07-20", -10_000_000]])]]),
      committed: new Map(),
      real: realOf("fin", "2026-07-20", -2_200_000),
    });
    const cell = m.rows[0]!.cells[2]!;
    // real − projSigned = −2.2M − (−10M) = +7.8M; pct = 7.8M/10M = 78
    expect(cell.drift).toMatchObject({ delta: 7_800_000, pct: 78 });
  });
});

describe("assembleMatrix — residual / saldo por ejecutar", () => {
  it("real parcial suma residual a flows y baja balances[ci]", () => {
    const rows = [row({ id: "fin", section: "FINANCIAMIENTO" })];
    const m = assembleMatrix({
      rows,
      weeks: WEEKS,
      currentWeek: CURRENT,
      openingBalance: 85_000_000,
      plan: new Map([["fin", new Map([["2026-07-20", -10_000_000]])]]),
      committed: new Map(),
      real: realOf("fin", "2026-07-20", -2_200_000),
    });
    const cell = m.rows[0]!.cells[2]!;
    expect(cell.layer).toBe("real");
    expect(cell.effective).toBe(-10_000_000);
    expect(cell.execution).toMatchObject({
      residual: -7_800_000,
      state: "partial",
    });
    expect(m.flows[2]).toBe(-10_000_000);
    // Ancla: banco hoy + (effective − real) = 85M + (−10M − (−2.2M)) = 77.2M
    expect(m.balances[2]).toBe(77_200_000);
  });

  it("settlement CLOSED deja la celda en el real", () => {
    const rows = [row({ id: "fin", section: "FINANCIAMIENTO" })];
    const settlements = new Map([
      ["fin", new Map([["2026-07-20", "CLOSED" as const]])],
    ]);
    const m = assembleMatrix({
      rows,
      weeks: WEEKS,
      currentWeek: CURRENT,
      openingBalance: 85_000_000,
      plan: new Map([["fin", new Map([["2026-07-20", -10_000_000]])]]),
      committed: new Map(),
      real: realOf("fin", "2026-07-20", -2_200_000),
      settlements,
    });
    const cell = m.rows[0]!.cells[2]!;
    expect(cell.effective).toBe(-2_200_000);
    expect(cell.execution?.state).toBe("closed");
    expect(m.flows[2]).toBe(-2_200_000);
    expect(m.balances[2]).toBe(85_000_000); // sin pendiente
  });

  it("residualCarryEnabled=false reproduce el legado (effective = real)", () => {
    const rows = [row({ id: "fin", section: "FINANCIAMIENTO" })];
    const m = assembleMatrix({
      rows,
      weeks: WEEKS,
      currentWeek: CURRENT,
      openingBalance: 85_000_000,
      plan: new Map([["fin", new Map([["2026-07-20", -10_000_000]])]]),
      committed: new Map(),
      real: realOf("fin", "2026-07-20", -2_200_000),
      residualCarryEnabled: false,
    });
    expect(m.rows[0]!.cells[2]!.effective).toBe(-2_200_000);
    expect(m.flows[2]).toBe(-2_200_000);
    expect(m.balances[2]).toBe(85_000_000);
  });

  it("semana pasada nunca suma residual", () => {
    const rows = [row({ id: "fin", section: "FINANCIAMIENTO" })];
    const m = assembleMatrix({
      rows,
      weeks: WEEKS,
      currentWeek: CURRENT,
      openingBalance: 10_000_000,
      plan: new Map([["fin", new Map([["2026-07-13", -10_000_000]])]]),
      committed: new Map(),
      real: realOf("fin", "2026-07-13", -2_200_000),
    });
    const past = m.rows[0]!.cells[1]!;
    expect(past.effective).toBe(-2_200_000);
    expect(past.execution).toBeNull();
    expect(m.flows[1]).toBe(-2_200_000);
  });

  it("factura parcial: real + committedNet sin doble conteo", () => {
    const pending = 5_511_641;
    const paid = 4_000_000;
    const committed: CommittedByRow = new Map([
      [
        "ing",
        new Map([
          [
            "2026-07-20",
            {
              total: pending,
              items: [
                {
                  kind: "dte",
                  dteId: "d1",
                  folio: 9,
                  label: "Cliente",
                  fecha: "2026-07-21",
                  monto: pending,
                },
              ],
            },
          ],
        ]),
      ],
    ]);
    const m = assembleMatrix({
      rows: [row({ id: "ing", section: "INGRESOS" })],
      weeks: WEEKS,
      currentWeek: CURRENT,
      openingBalance: 0,
      plan: new Map(),
      committed,
      real: realOf("ing", "2026-07-20", paid),
    });
    expect(m.rows[0]!.cells[2]!.effective).toBe(9_511_641);
    expect(m.flows[2]).toBe(9_511_641);
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
  it("agrupa por mes del lunes, suma flujos y encadena saldo desde ancla", () => {
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

  /**
   * v5.2 — caso Ametel (frontera mayo→junio):
   * Factura con fecha 02/06 en semana del lunes 31/05.
   * Pre-v5.2 (mes del lunes): ambas caían en MAY (×2) y JUN vacío.
   * Post-v5.2 (mes de `fecha`): MAY 1× y JUN 1×.
   */
  it("v5.2 atribuye ítem frontera por fecha (caso Ametel MAY/JUN)", () => {
    // 2027-05-31 = lunes; la semana incluye 01–06 jun.
    const frontierWeeks = [
      "2027-05-03", "2027-05-10", "2027-05-17", "2027-05-24", "2027-05-31",
      "2027-06-07", "2027-06-14",
    ];
    const current = "2027-05-03"; // todo futuro → committed cuenta
    const amount = 5_200_767;
    const committed: CommittedByRow = new Map([
      [
        "r1",
        new Map([
          [
            "2027-05-10",
            {
              total: amount,
              items: [{
                kind: "scheduled" as const,
                templateId: "tpl-ametel",
                label: "Ametel Los Poetas",
                fecha: "2027-05-05",
                monto: amount,
                issueYmd: "2027-05-05",
              }],
            },
          ],
          [
            "2027-05-31", // semana frontera (lunes MAY)
            {
              total: amount,
              items: [{
                kind: "scheduled" as const,
                templateId: "tpl-ametel",
                label: "Ametel Los Poetas",
                fecha: "2027-06-02", // emisión JUN
                monto: amount,
                issueYmd: "2027-06-02",
              }],
            },
          ],
        ]),
      ],
    ]);
    const m = assembleMatrix({
      rows: [row({ name: "Ametel Los Poetas" })],
      weeks: frontierWeeks,
      currentWeek: current,
      openingBalance: 10_000_000,
      plan: new Map(),
      committed,
      real: new Map(),
    });
    const r = reduceMonthly(frontierWeeks, current, m);
    expect(r.columns.map((c) => c.key)).toEqual(["2027-05", "2027-06"]);
    const may = r.rows[0]!.cells[0]!;
    const jun = r.rows[0]!.cells[1]!;
    expect(may.committed?.total).toBe(amount);
    expect(jun.committed?.total).toBe(amount);
    expect(may.effective).toBe(amount);
    expect(jun.effective).toBe(amount);
    // Σ anual de la fila idéntica a la vista semanal.
    const weekSum = m.flows.reduce((s, f) => s + f, 0);
    const monthSum = r.flows.reduce((s, f) => s + f, 0);
    expect(monthSum).toBe(weekSum);
    expect(monthSum).toBe(amount * 2);
  });

  it("v5.2 semana frontera: ítem entrante y saliente en la misma fila", () => {
    const weeks = ["2027-05-24", "2027-05-31", "2027-06-07"];
    const current = "2027-05-24";
    const committed: CommittedByRow = new Map([
      [
        "r1",
        new Map([
          [
            "2027-05-31",
            {
              total: 300,
              items: [
                {
                  kind: "draft" as const,
                  label: "sale a jun",
                  fecha: "2027-06-01",
                  monto: 100,
                  issueYmd: "2027-06-01",
                },
                {
                  kind: "draft" as const,
                  label: "queda en may",
                  fecha: "2027-05-31",
                  monto: 200,
                  issueYmd: "2027-05-31",
                },
              ],
            },
          ],
        ]),
      ],
    ]);
    const m = assembleMatrix({
      rows: [row({})],
      weeks,
      currentWeek: current,
      openingBalance: 0,
      plan: new Map(),
      committed,
      real: new Map(),
    });
    const r = reduceMonthly(weeks, current, m);
    expect(r.rows[0]!.cells[0]!.committed?.total).toBe(200); // MAY
    expect(r.rows[0]!.cells[1]!.committed?.total).toBe(100); // JUN
  });

  it("v5.2 mes sin ítems propios queda vacío (no hereda frontera)", () => {
    const weeks = ["2027-05-31", "2027-06-07", "2027-06-14"];
    const current = "2027-05-31";
    const committed: CommittedByRow = new Map([
      [
        "r1",
        new Map([
          [
            "2027-05-31",
            {
              total: 1_000,
              items: [{
                kind: "scheduled" as const,
                label: "solo junio",
                fecha: "2027-06-03",
                monto: 1_000,
                issueYmd: "2027-06-03",
              }],
            },
          ],
        ]),
      ],
    ]);
    const m = assembleMatrix({
      rows: [row({})],
      weeks,
      currentWeek: current,
      openingBalance: 0,
      plan: new Map(),
      committed,
      real: new Map(),
    });
    const r = reduceMonthly(weeks, current, m);
    expect(r.rows[0]!.cells[0]!.layer).toBe("empty"); // MAY vacío
    expect(r.rows[0]!.cells[0]!.effective).toBe(0);
    expect(r.rows[0]!.cells[1]!.committed?.total).toBe(1_000); // JUN
  });

  it("v5.2 plan sigue por mes del lunes; real por fecha del movimiento", () => {
    const weeks = ["2027-05-31", "2027-06-07"];
    const current = "2027-06-07";
    const real: RealByRow = new Map([
      [
        "r1",
        new Map([
          [
            "2027-05-31",
            {
              total: 500,
              items: [{
                bankTransactionId: "tx1",
                label: "cobro jun",
                fecha: "2027-06-02",
                monto: 500,
              }],
            },
          ],
        ]),
      ],
    ]);
    const m = assembleMatrix({
      rows: [row({})],
      weeks,
      currentWeek: current,
      openingBalance: 1_000,
      plan: new Map([["r1", new Map([["2027-05-31", 200]])]]),
      committed: new Map(),
      real,
    });
    const r = reduceMonthly(weeks, current, m);
    // Plan de la semana 31/05 → MAY; real con fecha 02/06 → JUN
    expect(r.rows[0]!.cells[0]!.plan).toBe(200);
    expect(r.rows[0]!.cells[0]!.real).toBeNull();
    expect(r.rows[0]!.cells[1]!.real?.total).toBe(500);
  });

  it("v5.2 sellos anclan saldo mensual sin balanceBreaks falsos", () => {
    const weeks = ["2026-07-06", "2026-07-13", "2026-07-20", "2026-07-27", "2026-08-03"];
    const current = "2026-07-20";
    const sealed = new Map([["2026-07-13", 5_000]]);
    const m = assembleMatrix({
      rows: [row({})],
      weeks,
      currentWeek: current,
      openingBalance: 10_000,
      plan: new Map([["r1", new Map([["2026-07-27", 100], ["2026-08-03", 50]])]]),
      committed: new Map(),
      real: realOf("r1", "2026-07-06", 200),
      sealedBalances: sealed,
    });
    const r = reduceMonthly(weeks, current, m, { sealedBalances: sealed });
    expect(r.balanceBreaks.every((b) => b == null)).toBe(true);
    // Mes con sello: saldo = sello (último del mes).
    expect(r.balances[0]).toBe(5_000);
    // Agosto encadena desde el sello + flujos futuros del mes.
    expect(r.balances[1]).toBe(5_000 + 50);
  });
});
