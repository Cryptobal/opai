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
  { id: "row-sueldos", name: "Sueldos líquidos", mapping: "CATEGORY", crmAccountId: null, installationId: null, categoryId: "cat-sueldo", supplierId: null },
  { id: "row-f29", name: "IVA F29", mapping: "MANUAL", crmAccountId: null, installationId: null, categoryId: null, supplierId: null },
  { id: "row-arriendo", name: "Arriendo", mapping: "CATEGORY", crmAccountId: null, installationId: null, categoryId: "cat-arriendo", supplierId: null },
  { id: "row-prov", name: "Proveedor X", mapping: "SUPPLIER", crmAccountId: null, installationId: null, categoryId: null, supplierId: "sup-1" },
  { id: "row-te", name: "Turnos extra", mapping: "MANUAL", crmAccountId: null, installationId: null, categoryId: null, supplierId: null },
];
const CODES = new Map([
  ["cat-sueldo", "EGR_SUELDO"],
  ["cat-arriendo", "EGR_ARRIENDO"],
]);

const base = { rows: ROWS, weeks: WEEKS, todayYmd: TODAY, milestones: [], receivedDtes: [], categoryCodeById: CODES };

describe("deriveCommittedExpense — hitos payroll/F29", () => {
  it("líquido cae en fila CATEGORY por código EGR_SUELDO", () => {
    const out = deriveCommittedExpense({
      ...base,
      milestones: [{ key: "liquido", label: "Sueldos líquidos", dateYmd: "2026-08-05", amountClp: 9_000_000 }],
    });
    // 2026-08-05 (miércoles) → semana del lunes 2026-08-03
    expect(out.get("row-sueldos")?.get("2026-08-03")?.total).toBe(9_000_000);
  });

  it("F29 sin fila CATEGORY cae en fila MANUAL por nombre canónico", () => {
    const out = deriveCommittedExpense({
      ...base,
      milestones: [{ key: "f29", label: "IVA F29 2026-06", dateYmd: "2026-08-12", amountClp: 2_500_000 }],
    });
    expect(out.get("row-f29")?.get("2026-08-10")?.total).toBe(2_500_000);
  });

  it("hito sin fila conocida cae en UNMATCHED (Otros gastos)", () => {
    const out = deriveCommittedExpense({
      ...base,
      milestones: [{ key: "quincena", label: "Quincena", dateYmd: "2026-08-14", amountClp: 1_000_000 }],
    });
    expect(out.get(UNMATCHED_EXPENSE_KEY)?.get("2026-08-10")?.total).toBe(1_000_000);
  });

  it("turnos extra aprobados caen en la fila TE por nombre canónico (F5)", () => {
    const out = deriveCommittedExpense({
      ...base,
      milestones: [{ key: "turnos_extra", label: "Turnos extra por pagar (12 aprobados)", dateYmd: TODAY, amountClp: 840_000 }],
    });
    // 2026-07-21 (martes) → semana actual lunes 2026-07-20
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
});

describe("deriveCommittedExpense — DTEs recibidos", () => {
  const recibido = {
    id: "rx-1", folio: 555, dateYmd: "2026-07-10", dueDateYmd: "2026-08-20" as string | null,
    paymentTermDays: 30, pendingClp: 300_000, supplierId: null as string | null,
    categoryId: "cat-arriendo" as string | null, issuerName: "Inmobiliaria SpA",
  };

  it("cae en la semana del vencimiento en su fila CATEGORY", () => {
    const out = deriveCommittedExpense({ ...base, receivedDtes: [recibido] });
    const cell = out.get("row-arriendo")?.get("2026-08-17");
    expect(cell?.total).toBe(300_000);
    expect(cell?.items[0]).toMatchObject({ kind: "dte", folio: 555 });
  });

  it("fila SUPPLIER tiene precedencia sobre CATEGORY", () => {
    const out = deriveCommittedExpense({
      ...base,
      receivedDtes: [{ ...recibido, supplierId: "sup-1" }],
    });
    expect(out.get("row-prov")?.get("2026-08-17")?.total).toBe(300_000);
    expect(out.get("row-arriendo")).toBeUndefined();
  });

  it("sin dueDate usa emisión+término; vencido clampea a semana actual; sin categoría → unmatched", () => {
    const out = deriveCommittedExpense({
      ...base,
      receivedDtes: [{
        ...recibido, dueDateYmd: null, dateYmd: "2026-05-02", paymentTermDays: 15,
        categoryId: null,
      }],
    });
    expect(out.get(UNMATCHED_EXPENSE_KEY)?.get("2026-07-20")?.total).toBe(300_000);
  });
});
