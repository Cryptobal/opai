import { describe, it, expect } from "vitest";
import { deriveCommittedExpense } from "../derive-committed-expense";
import { UNMATCHED_EXPENSE_KEY, type FlowRowRef } from "../types";
import { enumerateWeeks } from "../weeks";

const TODAY = "2026-07-21";
const WEEKS = enumerateWeeks(
  new Date(Date.UTC(2026, 5, 22)),
  new Date(Date.UTC(2026, 11, 28)),
);

const ROWS: FlowRowRef[] = [
  { id: "row-sueldos", name: "Sueldos líquidos", mapping: "ACCOUNTS", crmAccountId: null, installationId: null, categoryId: null, canonicalKey: "SUELDO", supplierId: null },
  { id: "row-f29", name: "IVA F29", mapping: "MANUAL", crmAccountId: null, installationId: null, categoryId: null, canonicalKey: "IVA_F29", supplierId: null },
  { id: "row-arriendo", name: "Arriendo", mapping: "ACCOUNTS", crmAccountId: null, installationId: null, categoryId: null, accountPlanIds: ["plan-arr"], supplierId: null },
  { id: "row-prov", name: "Proveedor X", mapping: "SUPPLIER", crmAccountId: null, installationId: null, categoryId: null, supplierId: "sup-1" },
  { id: "row-te", name: "Turnos extra", mapping: "MANUAL", crmAccountId: null, installationId: null, categoryId: null, canonicalKey: "TURNO_EXTRA", supplierId: null },
  { id: "row-retiro", name: "Retiro socios", section: "FINANCIAMIENTO", mapping: "MANUAL", crmAccountId: null, installationId: null, categoryId: null, canonicalKey: "RETIRO_SOCIO", supplierId: null },
  { id: "row-fin", name: "Crédito banco", section: "FINANCIAMIENTO", mapping: "MANUAL", crmAccountId: null, installationId: null, categoryId: null, supplierId: null },
  { id: "row-finiquitos", name: "Finiquitos", mapping: "MANUAL", crmAccountId: null, installationId: null, categoryId: null, canonicalKey: "FINIQUITO", supplierId: null },
];

const ACCOUNT_TO_ROW = new Map([["plan-arr", "row-arriendo"]]);

const base = {
  rows: ROWS,
  weeks: WEEKS,
  todayYmd: TODAY,
  milestones: [],
  receivedDtes: [],
  accountToRowId: ACCOUNT_TO_ROW,
};

describe("deriveCommittedExpense — hitos payroll/F29", () => {
  it("líquido cae en fila por canonicalKey SUELDO", () => {
    const out = deriveCommittedExpense({
      ...base,
      milestones: [{ key: "liquido", label: "Sueldos líquidos", dateYmd: "2026-08-05", amountClp: 9_000_000 }],
    });
    expect(out.get("row-sueldos")?.get("2026-08-03")?.total).toBe(9_000_000);
  });

  it("F29 cae por canonicalKey IVA_F29 (sin fallback por nombre)", () => {
    const out = deriveCommittedExpense({
      ...base,
      milestones: [{ key: "f29", label: "IVA F29 2026-06", dateYmd: "2026-08-12", amountClp: 2_500_000 }],
    });
    expect(out.get("row-f29")?.get("2026-08-10")?.total).toBe(2_500_000);
  });

  it("impuesto_unico cae en fila F29 (IVA_F29)", () => {
    const out = deriveCommittedExpense({
      ...base,
      milestones: [{
        key: "impuesto_unico",
        label: "Impuesto único 2ª categoría (retenciones)",
        dateYmd: "2026-08-12",
        amountClp: 150_000,
      }],
    });
    expect(out.get("row-f29")?.get("2026-08-10")?.total).toBe(150_000);
  });

  it("impuesto_unico sin fila F29 cae en UNMATCHED sin romper", () => {
    const rowsSinF29 = ROWS.filter((r) => r.id !== "row-f29");
    const out = deriveCommittedExpense({
      ...base,
      rows: rowsSinF29,
      milestones: [{
        key: "impuesto_unico",
        label: "Impuesto único",
        dateYmd: "2026-08-12",
        amountClp: 50_000,
      }],
    });
    expect(out.get(UNMATCHED_EXPENSE_KEY)?.get("2026-08-10")?.total).toBe(50_000);
  });

  it("hito sin fila conocida cae en UNMATCHED (Otros egresos)", () => {
    const out = deriveCommittedExpense({
      ...base,
      milestones: [{ key: "quincena", label: "Quincena", dateYmd: "2026-08-14", amountClp: 1_000_000 }],
    });
    expect(out.get(UNMATCHED_EXPENSE_KEY)?.get("2026-08-10")?.total).toBe(1_000_000);
  });

  it("turnos extra aprobados caen por canonicalKey TURNO_EXTRA", () => {
    const out = deriveCommittedExpense({
      ...base,
      milestones: [{ key: "turnos_extra", label: "Turnos extra por pagar (12 aprobados)", dateYmd: TODAY, amountClp: 840_000 }],
    });
    const cell = out.get("row-te")?.get("2026-07-20");
    expect(cell?.total).toBe(840_000);
    expect(cell?.items[0].label).toContain("12 aprobados");
  });

  it("hito pasado queda en su semana natural (no clampea)", () => {
    const out = deriveCommittedExpense({
      ...base,
      milestones: [{ key: "liquido", label: "Sueldos", dateYmd: "2026-07-03", amountClp: 100 }],
    });
    expect(out.get("row-sueldos")?.get("2026-06-29")?.total).toBe(100);
    expect(out.get("row-sueldos")?.get("2026-07-20")).toBeUndefined();
  });

  it("retiro socios cae por canonicalKey RETIRO_SOCIO", () => {
    const out = deriveCommittedExpense({
      ...base,
      milestones: [{
        key: "retiro_socio",
        label: "Retiro socios 2026-08",
        dateYmd: "2026-08-05",
        amountClp: 500_000,
      }],
    });
    expect(out.get("row-retiro")?.get("2026-08-03")?.total).toBe(500_000);
  });

  it("finiquitos cae en fila canónica", () => {
    const out = deriveCommittedExpense({
      ...base,
      milestones: [{
        key: "finiquitos",
        label: "Finiquitos",
        dateYmd: "2026-08-30",
        amountClp: 2_000_000,
      }],
    });
    expect(out.get("row-finiquitos")?.get("2026-08-24")?.total).toBe(2_000_000);
  });

  it("TE semanal proyectado respeta semanas bloqueadas por plan", () => {
    const out = deriveCommittedExpense({
      ...base,
      teRowId: "row-te",
      tePlanBlockedWeeks: new Set(["2026-08-03"]),
      teWeeklyProjections: [
        { weekYmd: "2026-08-03", amountClp: 100, label: "TE proy" },
        { weekYmd: "2026-08-10", amountClp: 100, label: "TE proy" },
      ],
    });
    expect(out.get("row-te")?.get("2026-08-03")).toBeUndefined();
    expect(out.get("row-te")?.get("2026-08-10")?.total).toBe(100);
  });

  it("PCT_SALES proyecta en la fila destino (magnitud positiva en egreso)", () => {
    const out = deriveCommittedExpense({
      ...base,
      pctSalesProjections: [{
        rowId: "row-retiro",
        weekYmd: "2026-08-03",
        dateYmd: "2026-08-05",
        amountClp: 1_450_000,
        label: "10% ventas 2026-07",
      }],
    });
    expect(out.get("row-retiro")?.get("2026-08-03")?.total).toBe(1_450_000);
  });

  it("PCT_SALES en FINANCIAMIENTO: +mag egreso / −mag ingreso (ensamblado −total)", () => {
    const out = deriveCommittedExpense({
      ...base,
      pctSalesProjections: [{
        rowId: "row-fin",
        weekYmd: "2026-08-03",
        dateYmd: "2026-08-05",
        amountClp: 500_000,
        label: "5% ventas",
        cashSigned: true,
      }],
    });
    expect(out.get("row-fin")?.get("2026-08-03")?.total).toBe(500_000);
  });

  it("metaNote se incluye en label del item", () => {
    const out = deriveCommittedExpense({
      ...base,
      milestones: [{
        key: "f29",
        label: "IVA F29 2026-08",
        dateYmd: "2026-09-12",
        amountClp: 0,
        metaNote: "IVA a favor",
      }],
    });
    expect(out.get("row-f29")?.get("2026-09-07")).toBeUndefined();
    const out2 = deriveCommittedExpense({
      ...base,
      milestones: [{
        key: "f29",
        label: "IVA F29 2026-08",
        dateYmd: "2026-09-12",
        amountClp: 100,
        metaNote: "IVA a favor",
      }],
    });
    expect(out2.get("row-f29")?.get("2026-09-07")?.items[0].label).toContain("IVA a favor");
  });
});

describe("deriveCommittedExpense — DTEs recibidos", () => {
  const recibido = {
    id: "rx-1", folio: 555, dateYmd: "2026-07-10", dueDateYmd: "2026-08-20" as string | null,
    paymentTermDays: 30, pendingClp: 300_000, supplierId: null as string | null,
    accountPlanId: "plan-arr" as string | null, issuerName: "Inmobiliaria SpA",
  };

  it("cae en la semana del vencimiento en su fila por cuenta", () => {
    const out = deriveCommittedExpense({ ...base, receivedDtes: [recibido] });
    const cell = out.get("row-arriendo")?.get("2026-08-17");
    expect(cell?.total).toBe(300_000);
    expect(cell?.items[0]).toMatchObject({ kind: "dte", folio: 555 });
  });

  it("fila SUPPLIER tiene precedencia sobre cuenta", () => {
    const out = deriveCommittedExpense({
      ...base,
      receivedDtes: [{ ...recibido, supplierId: "sup-1" }],
    });
    expect(out.get("row-prov")?.get("2026-08-17")?.total).toBe(300_000);
    expect(out.get("row-arriendo")).toBeUndefined();
  });

  it("sin dueDate usa emisión+término; vencido clampea a semana actual; sin cuenta → unmatched", () => {
    const out = deriveCommittedExpense({
      ...base,
      receivedDtes: [{
        ...recibido, dueDateYmd: null, dateYmd: "2026-05-02", paymentTermDays: 15,
        accountPlanId: null,
      }],
    });
    expect(out.get(UNMATCHED_EXPENSE_KEY)?.get("2026-07-20")?.total).toBe(300_000);
  });
});
