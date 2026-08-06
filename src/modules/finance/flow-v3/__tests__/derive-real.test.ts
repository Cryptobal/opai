import { describe, it, expect } from "vitest";
import { deriveReal, type DteRefInput, type RealTxInput } from "../derive-real";
import {
  UNMATCHED_EXPENSE_KEY,
  UNMATCHED_INCOME_KEY,
  type FlowRowRef,
} from "../types";
import { enumerateWeeks } from "../weeks";

const WEEKS = enumerateWeeks(
  new Date(Date.UTC(2026, 5, 22)),
  new Date(Date.UTC(2026, 7, 31)),
);

const ROWS: FlowRowRef[] = [
  { id: "row-cliA", name: "Cliente A", crmAccountId: "acc-A", installationId: null, categoryId: null, supplierId: null, mapping: "ACCOUNT_INSTALLATION", section: "INGRESOS" },
  { id: "row-arriendo", name: "Arriendo", crmAccountId: null, installationId: null, categoryId: null, canonicalKey: null, accountPlanIds: ["plan-arr"], supplierId: null, section: "GAV", mapping: "ACCOUNTS" },
  { id: "row-sueldos", name: "Sueldos líquidos", crmAccountId: null, installationId: null, categoryId: null, canonicalKey: "SUELDO", accountPlanIds: ["plan-rem"], supplierId: null, section: "REMUNERACIONES", mapping: "ACCOUNTS" },
  { id: "row-quincena", name: "Quincena", crmAccountId: null, installationId: null, categoryId: null, canonicalKey: "QUINCENA", accountPlanIds: ["plan-rem"], supplierId: null, section: "REMUNERACIONES", mapping: "ACCOUNTS" },
  { id: "row-te", name: "Turnos extra", crmAccountId: null, installationId: null, categoryId: null, canonicalKey: "TURNO_EXTRA", accountPlanIds: ["plan-rem"], supplierId: null, section: "REMUNERACIONES", mapping: "ACCOUNTS" },
  { id: "row-finiquito", name: "Finiquitos", crmAccountId: null, installationId: null, categoryId: null, canonicalKey: "FINIQUITO", accountPlanIds: ["plan-rem"], supplierId: null, section: "REMUNERACIONES", mapping: "ACCOUNTS" },
  { id: "row-costo-fact", name: "Costo factoring", crmAccountId: null, installationId: null, categoryId: null, canonicalKey: "FACTORING", supplierId: null, mapping: "MANUAL", section: "FINANCIAMIENTO" },
];

/** Cuenta compartida: destino por defecto = sueldos (isDefaultTarget). */
const ACCOUNT_TO_ROW = new Map([
  ["plan-arr", "row-arriendo"],
  ["plan-rem", "row-sueldos"],
]);

function tx(over: Partial<RealTxInput>): RealTxInput {
  return { id: "tx-1", dateYmd: "2026-07-15", amountClp: 1_000_000, description: "TRANSFERENCIA", links: [], ...over };
}

const base = {
  rows: ROWS,
  weeks: WEEKS,
  dteById: new Map<string, DteRefInput>(),
  accountToRowId: ACCOUNT_TO_ROW,
};

describe("deriveReal", () => {
  it("abono conciliado a DTE emitido cae en la fila de la cuenta, semana del movimiento", () => {
    const dteById = new Map<string, DteRefInput>([
      ["dte-1", { folio: 321, direction: "ISSUED", crmAccountId: "acc-A", installationId: null, supplierId: null, name: "Cliente A" }],
    ]);
    const out = deriveReal({
      ...base,
      dteById,
      txs: [tx({ links: [{ targetType: "DTE_ISSUED", targetId: "dte-1", amountClp: 1_000_000, accountPlanId: null }] })],
    });
    const cell = out.get("row-cliA")?.get("2026-07-13");
    expect(cell?.total).toBe(1_000_000);
    expect(cell?.items[0]).toMatchObject({ folio: 321, bankTransactionId: "tx-1" });
    expect(cell?.items[0]?.ceded).toBeFalsy();
  });

  it("abono de DTE cedido conserva flag ceded en el real", () => {
    const dteById = new Map<string, DteRefInput>([
      ["dte-ced", {
        folio: 555, direction: "ISSUED", crmAccountId: "acc-A", installationId: null,
        supplierId: null, name: "Bienestar", ceded: true,
      }],
    ]);
    const out = deriveReal({
      ...base,
      dteById,
      txs: [tx({
        links: [{ targetType: "DTE_ISSUED", targetId: "dte-ced", amountClp: 1_000_000, accountPlanId: null }],
      })],
    });
    expect(out.get("row-cliA")?.get("2026-07-13")?.items[0]).toMatchObject({
      folio: 555,
      ceded: true,
    });
  });

  it("cargo con link EXPENSE rutea por cuenta contable → renglón", () => {
    const out = deriveReal({
      ...base,
      txs: [tx({
        amountClp: -450_000,
        links: [{ targetType: "EXPENSE", targetId: null, amountClp: 450_000, accountPlanId: "plan-arr" }],
      })],
    });
    expect(out.get("row-arriendo")?.get("2026-07-13")?.total).toBe(-450_000);
  });

  it("cuenta compartida por 4 renglones rutea al isDefaultTarget (sueldos)", () => {
    const out = deriveReal({
      ...base,
      txs: [tx({
        amountClp: -100_000,
        links: [{ targetType: "EXPENSE", targetId: null, amountClp: 100_000, accountPlanId: "plan-rem" }],
      })],
    });
    expect(out.get("row-sueldos")?.get("2026-07-13")?.total).toBe(-100_000);
    expect(out.get("row-quincena")).toBeUndefined();
    expect(out.get("row-te")).toBeUndefined();
    expect(out.get("row-finiquito")).toBeUndefined();
  });

  it("cargo PAYROLL_LIQUIDACION usa canonicalKey SUELDO aunque comparta cuenta", () => {
    const out = deriveReal({
      ...base,
      txs: [tx({
        amountClp: -2_000_000,
        links: [{ targetType: "PAYROLL_LIQUIDACION", targetId: "liq-1", amountClp: 2_000_000, accountPlanId: "plan-rem" }],
      })],
    });
    expect(out.get("row-sueldos")?.get("2026-07-13")?.total).toBe(-2_000_000);
  });

  it("abono sin match NO va a Otros ingresos (fila manual)", () => {
    const out = deriveReal({
      ...base,
      txs: [
        tx({ id: "tx-in", amountClp: 99_000 }),
        tx({ id: "tx-out", amountClp: -55_000, description: "PAGO TARJETA" }),
      ],
    });
    expect(out.get(UNMATCHED_INCOME_KEY)).toBeUndefined();
    expect(out.get(UNMATCHED_EXPENSE_KEY)?.get("2026-07-13")?.total).toBe(-55_000);
  });

  it("remanente de abono parcialmente conciliado NO va a Otros ingresos", () => {
    const dteById = new Map<string, DteRefInput>([
      ["dte-2", { folio: 400, direction: "ISSUED", crmAccountId: "acc-A", installationId: null, supplierId: null, name: "Cliente A" }],
    ]);
    const out = deriveReal({
      ...base,
      dteById,
      txs: [tx({
        amountClp: 800_000,
        links: [{ targetType: "DTE_ISSUED", targetId: "dte-2", amountClp: 500_000, accountPlanId: null }],
      })],
    });
    expect(out.get("row-cliA")?.get("2026-07-13")?.total).toBe(500_000);
    expect(out.get(UNMATCHED_INCOME_KEY)).toBeUndefined();
  });

  it("anticipo FACTORING_OPERATION no suma ingreso; shortfall EXPENSE → Costo factoring", () => {
    const out = deriveReal({
      ...base,
      txs: [tx({
        id: "tx-scf",
        amountClp: 9_000_000,
        description: "0774602593 Transf. SCF SERVICIOS F",
        links: [
          { targetType: "FACTORING_OPERATION", targetId: "op-1", amountClp: 4_000_000, accountPlanId: null },
          { targetType: "FACTORING_OPERATION", targetId: "op-2", amountClp: 5_000_000, accountPlanId: null },
          { targetType: "EXPENSE", targetId: null, amountClp: 1_000_000, accountPlanId: "plan-factor" },
        ],
      })],
    });
    expect(out.get(UNMATCHED_INCOME_KEY)).toBeUndefined();
    expect(out.get("row-cliA")).toBeUndefined();
    const cell = out.get("row-costo-fact")?.get("2026-07-13");
    expect(cell?.total).toBe(-1_000_000);
    expect(cell?.items[0]?.label).toContain("Costo factoring");
  });

  it("DTE_ISSUED sin fila de cuenta no cae en Otros ingresos", () => {
    const dteById = new Map<string, DteRefInput>([
      ["dte-x", { folio: 1, direction: "ISSUED", crmAccountId: "acc-Z", installationId: null, supplierId: null, name: "Desconocido" }],
    ]);
    const out = deriveReal({
      ...base,
      dteById,
      txs: [tx({
        links: [{ targetType: "DTE_ISSUED", targetId: "dte-x", amountClp: 1_000_000, accountPlanId: null }],
      })],
    });
    expect(out.get(UNMATCHED_INCOME_KEY)).toBeUndefined();
    expect(out.size).toBe(0);
  });

  it("abono conciliado de DTE OTHER_INCOME cae en UNMATCHED_INCOME_KEY", () => {
    const dteById = new Map<string, DteRefInput>([
      ["dte-oi", {
        folio: 77, direction: "ISSUED", crmAccountId: "acc-Z", installationId: null,
        supplierId: null, name: "Esporádico",
        flowRouting: "OTHER_INCOME",
      }],
    ]);
    const out = deriveReal({
      ...base,
      dteById,
      txs: [tx({
        links: [{ targetType: "DTE_ISSUED", targetId: "dte-oi", amountClp: 1_000_000, accountPlanId: null }],
      })],
    });
    expect(out.get(UNMATCHED_INCOME_KEY)?.get("2026-07-13")?.total).toBe(1_000_000);
  });

  it("OTHER_INCOME fuerza Otros ingresos aunque la cuenta tenga fila", () => {
    const dteById = new Map<string, DteRefInput>([
      ["dte-oi2", {
        folio: 78, direction: "ISSUED", crmAccountId: "acc-A", installationId: null,
        supplierId: null, name: "Cliente A",
        flowRouting: "OTHER_INCOME",
      }],
    ]);
    const out = deriveReal({
      ...base,
      dteById,
      txs: [tx({
        links: [{ targetType: "DTE_ISSUED", targetId: "dte-oi2", amountClp: 500_000, accountPlanId: null }],
      })],
    });
    expect(out.get(UNMATCHED_INCOME_KEY)?.get("2026-07-13")?.total).toBe(500_000);
    expect(out.get("row-cliA")).toBeUndefined();
  });

  it("movimiento fuera del rango se ignora", () => {
    const out = deriveReal({ ...base, txs: [tx({ dateYmd: "2026-09-15" })] });
    expect(out.size).toBe(0);
  });
});
